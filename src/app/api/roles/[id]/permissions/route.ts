import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findRoleById, PROTECTED_ROLE } from "@/modules/org/db/org";
import {
  listRolePermissionIds,
  setRolePermissions,
} from "@/modules/org/db/permissions";
import { rolePermissionsSchema } from "@/modules/org/schemas";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** GET /api/roles/[id]/permissions — permission ids granted to a profile (admin). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudieron cargar los permisos del perfil.",
      label: "GET /api/roles/[id]/permissions",
    },
    async () => {
      const permission_ids = await listRolePermissionIds(id);
      return NextResponse.json({ permission_ids });
    },
  );
}

/**
 * PUT /api/roles/[id]/permissions — replace the profile's full permission
 * grant set. Gated by `org.role:update` (managing grants is editing the
 * profile — no meta-permission). The protected `admin` profile is rejected:
 * it bypasses at the app layer and must never hold grant rows.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const raw = await parseBody(request);
  if (raw instanceof NextResponse) return raw;
  const parsed = rolePermissionsSchema.safeParse(raw);
  if (!parsed.success) return badRequest("Formato de permisos inválido.");
  const { permission_ids: permissionIds } = parsed.data;

  return handleRoute(
    {
      guard: () => requirePermission("org.role:update"),
      fail: "No se pudieron guardar los permisos.",
      label: "PUT /api/roles/[id]/permissions",
    },
    async () => {
      const current = await findRoleById(id);
      if (!current) return notFound("Perfil no encontrado.");
      if (current.name === PROTECTED_ROLE) {
        return conflict(
          `El rol '${PROTECTED_ROLE}' no usa permisos: siempre tiene acceso total.`,
        );
      }
      await setRolePermissions(id, permissionIds);
      revalidateTag("permissions", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}
