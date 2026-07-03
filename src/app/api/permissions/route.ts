import { NextResponse } from "next/server";
import { listPermissions } from "@/modules/org/db/permissions";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/**
 * GET /api/permissions — full permission catalog for the grants panel
 * (admin). Read-only: permissions are seeded by module migrations (V8
 * pattern), never created from the panel — same rule as nav sections.
 */
export async function GET() {
  try {
    await requireAnyRole(["admin"]);
    const permissions = await listPermissions();
    return NextResponse.json({ permissions });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/permissions failed:", err);
    return NextResponse.json(
      { error: "No se pudieron cargar los permisos." },
      { status: 500 },
    );
  }
}
