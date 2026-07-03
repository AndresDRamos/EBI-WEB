import "server-only";
import { db as rootDb } from "@/lib/db/client";
import type { Selectable } from "kysely";
import type { Permission } from "@/lib/db/types";

// Permission tables live in the `auth` schema. See the note in users.ts /
// org.ts: kysely-codegen flattens the schema out of the generated keys, so
// bind the client here or SQL Server resolves under dbo and 208s.
const db = rootDb.withSchema("auth");

export type PermissionRow = Selectable<Permission>;

/**
 * Resolve the permission codes granted to a set of access profiles (roles).
 * Input is the JWT `roles` claim (names, not ids). The protected `admin`
 * profile bypasses at the app layer (`requirePermission`) and never has
 * grant rows — same rule as `getNavForUser`.
 */
export async function getPermissionCodesForRoles(
  roleNames: string[],
): Promise<string[]> {
  if (roleNames.length === 0) return [];
  const rows = await db
    .selectFrom("permission")
    .innerJoin(
      "role_permission",
      "role_permission.permission_id",
      "permission.permission_id",
    )
    .innerJoin("role", "role.role_id", "role_permission.role_id")
    .select("permission.code")
    .distinct()
    .where("role.name", "in", roleNames)
    .execute();
  return rows.map((r) => r.code);
}

/**
 * Full permission catalog for the admin grants panel. Permissions are seeded
 * by module migrations (V8 pattern) — there is deliberately no create/update
 * here, mirroring the no-`createSection` rule in navigation/db.ts.
 */
export async function listPermissions(): Promise<PermissionRow[]> {
  return db.selectFrom("permission").selectAll().orderBy("code", "asc").execute();
}

export async function listRolePermissionIds(roleId: number): Promise<number[]> {
  const rows = await db
    .selectFrom("role_permission")
    .select("permission_id")
    .where("role_id", "=", roleId)
    .execute();
  return rows.map((r) => r.permission_id);
}

/** Replace the full permission grant set for a role in one transaction. */
export async function setRolePermissions(
  roleId: number,
  permissionIds: number[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("role_permission").where("role_id", "=", roleId).execute();
    if (permissionIds.length === 0) return;
    await trx
      .insertInto("role_permission")
      .values(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })))
      .execute();
  });
}
