import { NextResponse, type NextRequest } from "next/server";
import { getCellDetail, findCellById, assign } from "@/modules/production/db";
import { findAssetById } from "@/modules/maintenance/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/production/cells/[id]/assignments — current + closed history
 * (any authenticated user). */
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
    return NextResponse.json({ current: detail.current, history: detail.history });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  asset_id?: unknown;
  role_label?: unknown;
  valid_from?: unknown;
  note?: unknown;
}

/** POST /api/production/cells/[id]/assignments — assign an asset to this cell.
 * The filtered unique index allows the same asset to hold current assignments
 * in several cells at once; only a duplicate current (asset, cell) pair 409s. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cellId = parseId((await params).id);
  if (!cellId) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const assetId = Number(body.asset_id);
  if (!Number.isInteger(assetId) || assetId <= 0) {
    return NextResponse.json({ error: "Equipo inválido." }, { status: 422 });
  }
  let validFrom: Date | null = null;
  if (body.valid_from != null && body.valid_from !== "") {
    if (typeof body.valid_from !== "string") {
      return NextResponse.json({ error: "Fecha inválida." }, { status: 422 });
    }
    const d = new Date(body.valid_from);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Fecha inválida." }, { status: 422 });
    }
    validFrom = d;
  }
  try {
    const user = await requirePermission("production.assignment:create");
    if (!(await findCellById(cellId))) {
      return NextResponse.json({ error: "Celda no encontrada." }, { status: 404 });
    }
    if (!(await findAssetById(assetId))) {
      return NextResponse.json({ error: "Equipo inválido." }, { status: 422 });
    }
    const assignment = await assign({
      asset_id: assetId,
      cell_id: cellId,
      role_label: typeof body.role_label === "string" ? body.role_label : null,
      valid_from: validFrom,
      note: typeof body.note === "string" ? body.note : null,
      created_by: user.id,
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: "El equipo ya tiene una asignación vigente en esta celda." },
        { status: 409 },
      );
    }
    console.error("POST /api/production/cells/[id]/assignments failed:", err);
    return NextResponse.json(
      { error: "No se pudo asignar el equipo." },
      { status: 500 },
    );
  }
}
