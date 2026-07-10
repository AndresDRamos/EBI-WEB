import { NextResponse, type NextRequest } from "next/server";
import {
  findCellById,
  listCellChildren,
  reorderCellChildren,
} from "@/modules/production/db";
import { reorderCellChildrenSchema } from "@/modules/production/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/** POST /api/production/cells/[id]/children/reorder — persist a new Op10/
 * Op20… order for a parent's children. Body must list exactly the parent's
 * current children (any status); the db layer re-validates the exact set. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parentId = parseId((await params).id);
  if (!parentId) return badRequest("ID inválido.");
  const body = await parseBody(request, reorderCellChildrenSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("production.cell:update"),
      fail: "No se pudo reordenar.",
      label: "POST /api/production/cells/[id]/children/reorder",
    },
    async () => {
      const parent = await findCellById(parentId);
      if (!parent) return notFound("Celda no encontrada.");
      const children = await listCellChildren(parentId);
      const currentIds = new Set(children.map((c) => c.cell_id));
      const ordered = body.ordered_cell_ids;
      if (currentIds.size !== ordered.length || ordered.some((id) => !currentIds.has(id))) {
        return unprocessable("El orden debe incluir exactamente las celdas hijas vigentes.");
      }
      await reorderCellChildren(parentId, ordered);
      return NextResponse.json({ ok: true });
    },
  );
}
