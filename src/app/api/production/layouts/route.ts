import { NextResponse, type NextRequest } from "next/server";
import { listLayouts } from "@/modules/production/db/layout";
import { requireUser } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/**
 * GET /api/production/layouts?plant_id= — layout versions, newest first (any
 * authenticated user). List projection excludes the geometry LOB (V13
 * discipline); fetch a single layout for the full geometry.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const raw = request.nextUrl.searchParams.get("plant_id");
    let plantId: number | undefined;
    if (raw !== null) {
      plantId = Number(raw);
      if (!Number.isInteger(plantId) || plantId <= 0) {
        return NextResponse.json({ error: "Planta inválida." }, { status: 422 });
      }
    }
    const layouts = await listLayouts(plantId);
    return NextResponse.json({ layouts });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
