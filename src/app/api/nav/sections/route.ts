import { NextResponse } from "next/server";
import { listSections } from "@/modules/navigation/db";
import { requireAnyRole } from "@/lib/auth/rbac";
import { handleRoute } from "@/lib/api/handler";

/**
 * GET /api/nav/sections — list every section (admin). Sections are seeded by
 * module migrations (routes are owned by code); there is no POST here —
 * admins edit label/icon/order/active + grants, they cannot invent routes.
 */
export async function GET() {
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudieron cargar las secciones.",
      label: "GET /api/nav/sections",
    },
    async () => {
      const sections = await listSections();
      return NextResponse.json({ sections });
    },
  );
}
