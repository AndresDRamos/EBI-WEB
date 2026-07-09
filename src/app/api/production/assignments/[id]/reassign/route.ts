import { NextResponse, type NextRequest } from "next/server";
import {
  findAssignmentById,
  findCellById,
  reassign,
} from "@/modules/production/db";
import { findAssetById } from "@/modules/maintenance/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface ReassignBody {
  to_cell_id?: unknown;
  role_label?: unknown;
  note?: unknown;
}

/** POST /api/production/assignments/[id]/reassign — historized move: closes
 * the current row and opens a new one against the target cell in one
 * transaction. Requires both assignment permissions (it closes AND creates). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: ReassignBody;
  try {
    body = (await parseJsonBody(request)) as ReassignBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const toCellId = Number(body.to_cell_id);
  if (!Number.isInteger(toCellId) || toCellId <= 0) {
    return NextResponse.json({ error: "Celda destino inválida." }, { status: 422 });
  }
  try {
    const user = await requirePermission("production.assignment:close");
    await requirePermission("production.assignment:create");
    const existing = await findAssignmentById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Asignación no encontrada." },
        { status: 404 },
      );
    }
    if (existing.valid_to !== null) {
      return NextResponse.json(
        { error: "La asignación ya está cerrada." },
        { status: 409 },
      );
    }
    if (existing.cell_id === toCellId) {
      return NextResponse.json(
        { error: "La celda destino es la misma que la actual." },
        { status: 422 },
      );
    }
    const toCell = await findCellById(toCellId);
    if (!toCell) {
      return NextResponse.json({ error: "Celda destino inválida." }, { status: 422 });
    }
    // Cross-schema invariant (V18, app-enforced — house style, no triggers):
    // an asset only works in a cell that shares its physical location.
    const asset = await findAssetById(existing.asset_id);
    if (
      !asset ||
      toCell.location_id === null ||
      toCell.location_id !== asset.location_id
    ) {
      return NextResponse.json(
        { error: "La celda destino no está en la misma ubicación que el equipo." },
        { status: 422 },
      );
    }
    const assignment = await reassign({
      assignment_id: id,
      to_cell_id: toCellId,
      role_label: typeof body.role_label === "string" ? body.role_label : null,
      note: typeof body.note === "string" ? body.note : null,
      created_by: user.id,
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "La asignación ya está cerrada." },
        { status: 409 },
      );
    }
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: "El equipo ya tiene una asignación vigente en la celda destino." },
        { status: 409 },
      );
    }
    console.error("POST /api/production/assignments/[id]/reassign failed:", err);
    return NextResponse.json(
      { error: "No se pudo reasignar el equipo." },
      { status: 500 },
    );
  }
}
