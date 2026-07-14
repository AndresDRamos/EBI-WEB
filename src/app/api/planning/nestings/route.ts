import { NextResponse } from "next/server";
import { getLaserBacklog } from "@/modules/planning/db";
import { requireUser } from "@/lib/auth/rbac";
import { handleRoute } from "@/lib/api/handler";

/** GET /api/planning/nestings — backlog payload (open nestings + components +
 * downstream route + station catalog + ETL freshness). Filtering is
 * client-side. Any authenticated user. */
export async function GET() {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar los nesteos.", label: "GET /api/planning/nestings" },
    async () => NextResponse.json(await getLaserBacklog()),
  );
}
