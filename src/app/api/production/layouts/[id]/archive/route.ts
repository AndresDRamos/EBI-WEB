import { NextResponse, type NextRequest } from "next/server";
import { archiveActive } from "@/modules/production/db/layout";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseId } from "@/lib/api/handler";

/**
 * POST /api/production/layouts/[id]/archive — retire the ACTIVE layout
 * without a successor (its open placements close; the plant has no canvas).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("production.layout:archive"),
      fail: "No se pudo archivar el layout.",
      label: "POST /api/production/layouts/[id]/archive",
    },
    async () => {
      const result = await archiveActive(id);
      if (result.outcome === "not-found") return notFound("Layout no encontrado.");
      if (result.outcome === "not-active") {
        return conflict("Solo se puede archivar el layout activo.");
      }
      return NextResponse.json({
        ok: true,
        closed_placements: result.closedPlacements,
      });
    },
  );
}
