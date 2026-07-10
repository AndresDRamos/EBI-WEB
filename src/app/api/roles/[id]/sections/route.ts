import { NextResponse, type NextRequest } from "next/server";
import { listRoleSectionGrants } from "@/modules/navigation/db";
import { putRoleGrants } from "@/modules/navigation/grants";
import { roleSectionGrantsSchema } from "@/modules/navigation/schemas";
import { PROTECTED_ROLE } from "@/modules/org/db/org";
import { requireAnyRole } from "@/lib/auth/rbac";
import { badRequest, handleRoute, parseId } from "@/lib/api/handler";

/** GET /api/roles/[id]/sections — nav sections granted to a role (admin). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudieron cargar los accesos del rol.",
      label: "GET /api/roles/[id]/sections",
    },
    async () => {
      const grants = await listRoleSectionGrants(id);
      return NextResponse.json({ grants });
    },
  );
}

/**
 * PUT /api/roles/[id]/sections — replace the role's full section grant set
 * (role-centric dual of PUT /api/nav/sections/[id]/grants; same permission
 * gate). The protected `admin` role is rejected: it sees every section at the
 * app layer and must never hold grant rows.
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
    resource: "section",
    schema: roleSectionGrantsSchema,
    idField: "section_id",
    invalidBodyMessage: "Formato de accesos inválido.",
    protectedMessage: `El rol '${PROTECTED_ROLE}' no usa accesos: siempre ve todas las secciones.`,
    fail: "No se pudieron guardar los accesos.",
    label: "PUT /api/roles/[id]/sections",
  });
}
