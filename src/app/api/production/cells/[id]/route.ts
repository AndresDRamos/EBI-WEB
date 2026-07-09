import { NextResponse, type NextRequest } from "next/server";
import {
  cellHasChildren,
  findCellById,
  getCellDetail,
  updateCell,
} from "@/modules/production/db";
import { findProcessById } from "@/modules/org/db/processes";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/production/cells/[id] — cell detail with current composition and
 * closed history (any authenticated user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const detail = await getCellDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Celda no encontrada." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface PatchBody {
  name?: unknown;
  parent_cell_id?: unknown;
  size_x_m?: unknown;
  size_y_m?: unknown;
  process_id?: unknown;
  is_active?: unknown;
}

function parsePositiveNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/** PATCH /api/production/cells/[id] — update a production cell. `code` and
 * `location_id` are immutable (the code encodes the location). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: PatchBody;
  try {
    body = (await parseJsonBody(request)) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const changes: Parameters<typeof updateCell>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.parent_cell_id !== undefined) {
    const parentId = body.parent_cell_id == null ? null : Number(body.parent_cell_id);
    if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
      return NextResponse.json({ error: "Celda padre inválida." }, { status: 422 });
    }
    changes.parent_cell_id = parentId;
  }
  if (body.size_x_m !== undefined) {
    const sizeX = parsePositiveNumberOrNull(body.size_x_m);
    if (Number.isNaN(sizeX)) {
      return NextResponse.json({ error: "El tamaño X debe ser mayor a cero." }, { status: 422 });
    }
    changes.size_x_m = sizeX;
  }
  if (body.size_y_m !== undefined) {
    const sizeY = parsePositiveNumberOrNull(body.size_y_m);
    if (Number.isNaN(sizeY)) {
      return NextResponse.json({ error: "El tamaño Y debe ser mayor a cero." }, { status: 422 });
    }
    changes.size_y_m = sizeY;
  }
  if (body.process_id !== undefined) {
    const processId = body.process_id == null ? null : Number(body.process_id);
    if (processId !== null && (!Number.isInteger(processId) || processId <= 0)) {
      return NextResponse.json({ error: "Proceso inválido." }, { status: 422 });
    }
    changes.process_id = processId;
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requirePermission("production.cell:update");
    const existing = await findCellById(id);
    if (!existing) {
      return NextResponse.json({ error: "Celda no encontrada." }, { status: 404 });
    }
    if (changes.process_id != null && !(await findProcessById(changes.process_id))) {
      return NextResponse.json({ error: "Proceso inválido." }, { status: 422 });
    }
    if (changes.parent_cell_id !== undefined && changes.parent_cell_id !== null) {
      // Depth-1, both directions: the target parent cannot itself have a
      // parent, and this cell cannot already have children of its own.
      const parent = await findCellById(changes.parent_cell_id);
      if (!parent || !parent.is_active || parent.location_id !== existing.location_id) {
        return NextResponse.json(
          { error: "La celda padre no está en la misma ubicación o no existe." },
          { status: 422 },
        );
      }
      if (parent.parent_cell_id !== null) {
        return NextResponse.json(
          {
            error:
              "Una celda hija no puede tener celdas hijas a su vez (profundidad máxima: 1).",
          },
          { status: 422 },
        );
      }
      if (await cellHasChildren(id)) {
        return NextResponse.json(
          {
            error:
              "Esta celda ya tiene celdas hijas: no puede pasar a ser hija de otra.",
          },
          { status: 422 },
        );
      }
    }
    await updateCell(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/UQ_cell_parent_sequence/i.test(msg)) {
      return NextResponse.json(
        { error: "Ya existe una celda con esa secuencia en la línea." },
        { status: 409 },
      );
    }
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("PATCH /api/production/cells/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la celda." },
      { status: 500 },
    );
  }
}
