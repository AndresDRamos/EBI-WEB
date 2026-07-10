import { NextResponse, type NextRequest } from "next/server";
import { activateDraft } from "@/modules/production/db/layout";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseId } from "@/lib/api/handler";

/**
 * POST /api/production/layouts/[id]/confirm — activate a draft. ONE
 * transaction: archives the plant's previous active version, closes its open
 * placements and re-opens them on the new version (carry-forward, approved
 * 2026-07-06).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("production.layout:activate"),
      fail: "No se pudo activar el layout.",
      label: "POST /api/production/layouts/[id]/confirm",
    },
    async (user) => {
      const result = await activateDraft(id, user.id);
      if (result.outcome === "not-found") return notFound("Layout no encontrado.");
      if (result.outcome === "not-draft") {
        return conflict("Solo se puede confirmar un borrador.");
      }
      return NextResponse.json({
        layout: { ...result.layout, geometry: JSON.parse(result.layout.geometry) },
        carried_placements: result.carriedPlacements,
      });
    },
  );
}
