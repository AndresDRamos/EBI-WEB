import { NextResponse } from "next/server";
import { listFootprints } from "@/modules/production/db/footprint";
import { requireUser } from "@/lib/auth/rbac";
import { handleRoute } from "@/lib/api/handler";

/** GET /api/production/footprints — all footprints with asset refs (any user). */
export async function GET() {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar las huellas.", label: "GET /api/production/footprints" },
    async () => {
      const footprints = await listFootprints();
      return NextResponse.json({ footprints });
    },
  );
}
