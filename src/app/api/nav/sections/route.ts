import { NextResponse } from "next/server";
import { listSections } from "@/modules/navigation/db";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/**
 * GET /api/nav/sections — list every section (admin). Sections are seeded by
 * module migrations (routes are owned by code); there is no POST here —
 * admins edit label/icon/order/active + grants, they cannot invent routes.
 */
export async function GET() {
  try {
    await requireAnyRole(["admin"]);
    const sections = await listSections();
    return NextResponse.json({ sections });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/nav/sections failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar las secciones." }, { status: 500 });
  }
}
