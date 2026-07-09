import { NextResponse, type NextRequest } from "next/server";
import {
  findCellById,
  listCellChildren,
  reorderCellChildren,
} from "@/modules/production/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface ReorderBody {
  ordered_cell_ids?: unknown;
}

/** POST /api/production/cells/[id]/children/reorder — persist a new Op10/
 * Op20… order for a parent's children. Body must list exactly the parent's
 * current children (any status); the db layer re-validates the exact set. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parentId = parseId((await params).id);
  if (!parentId) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: ReorderBody;
  try {
    body = (await parseJsonBody(request)) as ReorderBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (
    !Array.isArray(body.ordered_cell_ids) ||
    body.ordered_cell_ids.length === 0 ||
    !body.ordered_cell_ids.every(
      (v) => typeof v === "number" && Number.isInteger(v) && v > 0,
    )
  ) {
    return NextResponse.json(
      { error: "Lista de celdas inválida." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("production.cell:update");
    const parent = await findCellById(parentId);
    if (!parent) {
      return NextResponse.json({ error: "Celda no encontrada." }, { status: 404 });
    }
    const children = await listCellChildren(parentId);
    const currentIds = new Set(children.map((c) => c.cell_id));
    const ordered = body.ordered_cell_ids as number[];
    if (
      currentIds.size !== ordered.length ||
      ordered.some((id) => !currentIds.has(id))
    ) {
      return NextResponse.json(
        { error: "El orden debe incluir exactamente las celdas hijas vigentes." },
        { status: 422 },
      );
    }
    await reorderCellChildren(parentId, ordered);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error(
      "POST /api/production/cells/[id]/children/reorder failed:",
      err,
    );
    return NextResponse.json(
      { error: "No se pudo reordenar." },
      { status: 500 },
    );
  }
}
