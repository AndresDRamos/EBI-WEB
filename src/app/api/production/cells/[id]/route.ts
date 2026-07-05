import { NextResponse, type NextRequest } from "next/server";
import {
  getCellDetail,
  findCellById,
  findLineById,
  updateCell,
} from "@/modules/production/db";
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
  code?: unknown;
  name?: unknown;
  plant_id?: unknown;
  line_id?: unknown;
  sequence_in_line?: unknown;
  is_active?: unknown;
}

/** PATCH /api/production/cells/[id] — update a production cell. */
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
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.plant_id !== undefined) {
    const plantId = Number(body.plant_id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return NextResponse.json({ error: "Planta inválida." }, { status: 422 });
    }
    changes.plant_id = plantId;
  }
  if (body.line_id !== undefined) {
    const lineId = body.line_id == null ? null : Number(body.line_id);
    if (lineId !== null && (!Number.isInteger(lineId) || lineId <= 0)) {
      return NextResponse.json({ error: "Línea inválida." }, { status: 422 });
    }
    changes.line_id = lineId;
  }
  if (body.sequence_in_line !== undefined) {
    const seq = body.sequence_in_line == null ? null : Number(body.sequence_in_line);
    if (seq !== null && (!Number.isInteger(seq) || seq <= 0)) {
      return NextResponse.json({ error: "Secuencia inválida." }, { status: 422 });
    }
    changes.sequence_in_line = seq;
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
    // Mirror of CK_cell_sequence_requires_line against the *effective* line
    // (body wins over the stored row), as a friendly 422.
    const effectiveLine =
      changes.line_id !== undefined ? changes.line_id : existing.line_id;
    const effectiveSeq =
      changes.sequence_in_line !== undefined
        ? changes.sequence_in_line
        : existing.sequence_in_line;
    if (effectiveSeq !== null && effectiveLine === null) {
      return NextResponse.json(
        { error: "La secuencia solo aplica cuando la celda pertenece a una línea." },
        { status: 422 },
      );
    }
    if (changes.line_id != null && !(await findLineById(changes.line_id))) {
      return NextResponse.json({ error: "Línea inválida." }, { status: 422 });
    }
    await updateCell(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/UQ_cell_line_sequence/i.test(msg)) {
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
