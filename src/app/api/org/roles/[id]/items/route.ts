import { NextResponse, type NextRequest } from "next/server";
import { listRoleItemGrants } from "@/modules/navigation/db";
import { putRoleGrants } from "@/modules/navigation/grants";
import { roleGrantsSchema } from "@/modules/navigation/schemas";
import { PROTECTED_ROLE } from "@/modules/org/db/org";
import { requireAnyRole } from "@/lib/auth/rbac";
import { badRequest, handleRoute, parseId } from "@/lib/api/handler";

/**
 * GET /api/roles/[id]/items — pages (nav items) visible to a role, with their
 * per-role order (`role_nav_item`, ADR 0008). Admin-only read.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudo cargar la visibilidad de páginas del rol.",
      label: "GET /api/roles/[id]/items",
    },
    async () => {
      const grants = await listRoleItemGrants(id);
      return NextResponse.json({ grants });
    },
  );
}

/**
 * PUT /api/roles/[id]/items — replace the role's full page-visibility set (and
 * per-role page order). Same gate as section grants (`navigation.grants:update`,
 * now page-granular). The protected `admin` role is rejected: it sees every
 * page at the app layer and must never hold grant rows.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return putRoleGrants({
    request,
    roleId: id,
    resource: "item",
    schema: roleGrantsSchema,
    idField: "item_id",
    invalidBodyMessage: "Formato de visibilidad inválido.",
    protectedMessage: `El rol '${PROTECTED_ROLE}' no usa visibilidad: siempre ve todas las páginas.`,
    fail: "No se pudo guardar la visibilidad de páginas.",
    label: "PUT /api/roles/[id]/items",
  });
}
