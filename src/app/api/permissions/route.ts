import { NextResponse } from "next/server";
import { listPermissions } from "@/modules/org/db/permissions";
import { requireAnyRole } from "@/lib/auth/rbac";
import { handleRoute } from "@/lib/api/handler";

/**
 * GET /api/permissions — full permission catalog for the grants panel
 * (admin). Read-only: permissions are seeded by module migrations (V8
 * pattern), never created from the panel — same rule as nav sections.
 */
export async function GET() {
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudieron cargar los permisos.",
      label: "GET /api/permissions",
    },
    async () => {
      const permissions = await listPermissions();
      return NextResponse.json({ permissions });
    },
  );
}
