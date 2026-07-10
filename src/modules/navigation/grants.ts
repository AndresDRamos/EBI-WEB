import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import type { ZodType } from "zod";
import { findRoleById, PROTECTED_ROLE } from "@/modules/org/db/org";
import { setRoleGrants, type RoleGrantResource } from "@/modules/navigation/db";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseBody } from "@/lib/api/handler";

interface PutRoleGrantsOptions<TIdField extends string> {
  request: NextRequest;
  roleId: number;
  resource: RoleGrantResource;
  /** Validates the request shape; issues are collapsed to `invalidBodyMessage` (400, matching the legacy handlers — not `parseBody`'s 422 schema path). */
  schema: ZodType<{ grants: Array<Record<TIdField, number> & { priority: number }> }>;
  idField: TIdField;
  invalidBodyMessage: string;
  protectedMessage: string;
  fail: string;
  label: string;
}

/**
 * Shared PUT handler body for `roles/[id]/items` and `roles/[id]/sections`:
 * both replace a role's full grant set on the same `role_nav_*` shape
 * (`role_id` + one FK + `priority`), gated by the same permission, rejecting
 * the protected `admin` role (it never holds grant rows), and invalidating
 * the same `nav` cache tag.
 */
export async function putRoleGrants<TIdField extends string>(
  opts: PutRoleGrantsOptions<TIdField>,
): Promise<NextResponse> {
  const raw = await parseBody(opts.request);
  if (raw instanceof NextResponse) return raw;
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) return badRequest(opts.invalidBodyMessage);
  const grants = parsed.data.grants.map((g) => ({ id: g[opts.idField], priority: g.priority }));

  return handleRoute(
    {
      guard: () => requirePermission("navigation.grants:update"),
      fail: opts.fail,
      label: opts.label,
    },
    async () => {
      const current = await findRoleById(opts.roleId);
      if (!current) return notFound("Rol no encontrado.");
      if (current.name === PROTECTED_ROLE) return conflict(opts.protectedMessage);
      await setRoleGrants(opts.resource, opts.roleId, grants);
      revalidateTag("nav", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}
