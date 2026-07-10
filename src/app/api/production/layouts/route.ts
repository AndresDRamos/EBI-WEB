import { NextResponse, type NextRequest } from "next/server";
import { listLayouts } from "@/modules/production/db/layout";
import { requireUser } from "@/lib/auth/rbac";
import { handleRoute, unprocessable } from "@/lib/api/handler";

/**
 * GET /api/production/layouts?plant_id= — layout versions, newest first (any
 * authenticated user). List projection excludes the geometry LOB (V13
 * discipline); fetch a single layout for the full geometry.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("plant_id");
  let plantId: number | undefined;
  if (raw !== null) {
    plantId = Number(raw);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return unprocessable("Planta inválida.");
    }
  }
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar el layout.", label: "GET /api/production/layouts" },
    async () => {
      const layouts = await listLayouts(plantId);
      return NextResponse.json({ layouts });
    },
  );
}
