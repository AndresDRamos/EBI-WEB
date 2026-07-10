import { NextResponse, type NextRequest } from "next/server";
import {
  closePlacement,
  findPlacementById,
} from "@/modules/production/db/placement";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseId } from "@/lib/api/handler";

/**
 * POST /api/production/placements/[id]/close — end a placement (sets
 * valid_to). Missing row → 404; already closed → 409.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("production.placement:close"),
      fail: "No se pudo cerrar la colocación.",
      label: "POST /api/production/placements/[id]/close",
    },
    async () => {
      if (!(await findPlacementById(id))) return notFound("Colocación no encontrada.");
      const closed = await closePlacement(id);
      if (!closed) return conflict("La colocación ya está cerrada.");
      return NextResponse.json({ ok: true });
    },
  );
}
