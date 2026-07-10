import { NextResponse, type NextRequest } from "next/server";
import { findPlacementById, movePose } from "@/modules/production/db/placement";
import { movePlacementSchema } from "@/modules/production/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/**
 * POST /api/production/placements/[id]/move — historized reposition (close +
 * insert in one transaction; x/y/rotation are NEVER updated in place).
 * Requires BOTH placement permissions — it closes AND creates, mirroring the
 * assignment `reassign` gate.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, movePlacementSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: async () => {
        await requirePermission("production.placement:close");
        return requirePermission("production.placement:create");
      },
      fail: "No se pudo mover la colocación.",
      label: "POST /api/production/placements/[id]/move",
    },
    async (user) => {
      const source = await findPlacementById(id);
      if (!source) return notFound("Colocación no encontrada.");
      const placement = await movePose({
        placement_id: id,
        x_m: body.x_m,
        y_m: body.y_m,
        rotation_deg: body.rotation_deg,
        note: body.note,
        created_by: user.id,
      });
      if (!placement) return conflict("La colocación ya está cerrada.");
      return NextResponse.json({ placement });
    },
  );
}
