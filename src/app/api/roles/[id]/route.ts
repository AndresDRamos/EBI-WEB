import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import {
  findRoleById,
  updateRole,
  deleteRole,
  RoleProtectedError,
  PROTECTED_ROLE,
} from "@/modules/org/db/org";
import { updateRoleSchema } from "@/modules/org/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/**
 * PUT /api/roles/[id] — update a role (admin). The `admin` role is protected
 * at the app layer from rename / deactivate; viewer and other roles are normal
 * CRUD. Soft-delete = set `is_active=false` via this verb; hard-delete = DELETE.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const changes = await parseBody(request, updateRoleSchema);
  if (changes instanceof NextResponse) return changes;

  return handleRoute(
    {
      guard: () => requirePermission("org.role:update"),
      uniqueFallback: "El rol ya existe.",
      fail: "No se pudo actualizar el rol.",
      label: "PUT /api/roles/[id]",
    },
    async () => {
      const current = await findRoleById(id);
      if (!current) return notFound("Rol no encontrado.");
      try {
        await updateRole(id, changes, current);
      } catch (err) {
        if (err instanceof RoleProtectedError) return conflict(err.message);
        throw err;
      }
      return NextResponse.json({ ok: true });
    },
  );
}

/**
 * DELETE /api/roles/[id] — hard delete. The `admin` role is rejected upfront;
 * other roles 409 when referenced by users (FK blocks). To deactivate, use
 * PUT with `is_active=false` — that also blocks for `admin`.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");

  return handleRoute(
    {
      guard: () => requirePermission("org.role:delete"),
      fail: "No se pudo eliminar el rol (¿tiene usuarios asignados?).",
      label: "DELETE /api/roles/[id]",
    },
    async () => {
      const current = await findRoleById(id);
      if (!current) return notFound("Rol no encontrado.");
      if (current.name === PROTECTED_ROLE) {
        return conflict(`El rol '${PROTECTED_ROLE}' no se puede eliminar.`);
      }
      try {
        await deleteRole(id);
      } catch (err) {
        console.error("DELETE /api/roles/[id] failed:", err);
        return conflict("No se pudo eliminar el rol (¿tiene usuarios asignados?).");
      }
      // deleteRole clears the profile's nav + permission grants in-transaction;
      // both layout caches must drop their stale entries.
      revalidateTag("nav", { expire: 0 });
      revalidateTag("permissions", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}
