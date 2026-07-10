import { NextResponse, type NextRequest } from "next/server";
import { findLayoutById } from "@/modules/production/db/layout";
import {
  createPlacement,
  listByLayout,
} from "@/modules/production/db/placement";
import { findAssetById } from "@/modules/maintenance/db";
import { findLocationById } from "@/modules/org/db/locations";
import { createPlacementSchema } from "@/modules/production/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, created, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/**
 * GET /api/production/layouts/[id]/placements?current=1 — placements of a
 * layout: current composition or full history (any authenticated user).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar los equipos.", label: "GET /api/production/layouts/[id]/placements" },
    async () => {
      if (!(await findLayoutById(id))) return notFound("Layout no encontrado.");
      const currentOnly = request.nextUrl.searchParams.get("current") === "1";
      const placements = await listByLayout(id, { currentOnly });
      return NextResponse.json({ placements });
    },
  );
}

/**
 * POST /api/production/layouts/[id]/placements — place an asset on the layout.
 * Cross-schema invariant enforced here (V13 note): the asset's plant must be
 * the layout's plant → 422 otherwise.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, createPlacementSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("production.placement:create"),
      uniqueRules: [
        {
          pattern: /UQ_asset_placement_current/i,
          message: "El equipo ya está colocado en este layout.",
        },
      ],
      uniqueFallback: "El equipo ya está colocado en este layout.",
      fail: "No se pudo colocar el equipo.",
      label: "POST /api/production/layouts/[id]/placements",
    },
    async (user) => {
      const layout = await findLayoutById(id);
      if (!layout) return notFound("Layout no encontrado.");
      const asset = await findAssetById(body.asset_id);
      if (!asset) return unprocessable("Equipo no encontrado.");
      // Plant is derived via the asset's location since V18.
      const location = await findLocationById(asset.location_id);
      if (!location || location.plant_id !== layout.plant_id) {
        return unprocessable("El equipo pertenece a otra planta.");
      }
      if (body.x_m > layout.width_m || body.y_m > layout.height_m) {
        return unprocessable("La posición cae fuera del lienzo del layout.");
      }
      const placement = await createPlacement({
        layout_id: id,
        asset_id: body.asset_id,
        x_m: body.x_m,
        y_m: body.y_m,
        rotation_deg: body.rotation_deg,
        note: body.note,
        created_by: user.id,
      });
      return created({ placement });
    },
  );
}
