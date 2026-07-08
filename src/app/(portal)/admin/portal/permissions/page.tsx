import { listRoles } from "@/modules/org/db/org";
import { listPermissions } from "@/modules/org/db/permissions";
import { listUsers } from "@/modules/org/db/users";
import { listSections, listItems } from "@/modules/navigation/db";
import { PermissionManager } from "@/modules/org/components/permission-manager";

export const dynamic = "force-dynamic";

/**
 * Permisos tab (Portal) — the unified permission manager: a single role
 * filter (reached either directly or via a user's role chips) drives both
 * the `<module>.<resource>:<action>` matrix and the nav-section access +
 * order tree. Replaces the old split between this tab and
 * `/admin/portal/modules` (removed — this screen now owns nav structure
 * CRUD too, via inline dialogs). Catalog data is migration-seeded (V8); this
 * screen only grants/revokes and edits structure.
 */
export default async function AdminPermissionsPage() {
  const [roles, users, permissions, sections, items] = await Promise.all([
    listRoles(true).catch(() => []),
    listUsers().catch(() => []),
    listPermissions().catch(() => []),
    listSections().catch(() => []),
    listItems().catch(() => []),
  ]);

  return (
    <PermissionManager
      roles={roles.map((r) => ({ role_id: r.role_id, name: r.name }))}
      users={users.map((u) => ({
        user_id: u.user_id,
        username: u.username,
        display_name: u.display_name,
        roles: u.role_refs,
      }))}
      permissions={permissions.map((p) => ({
        permission_id: p.permission_id,
        code: p.code,
        description: p.description,
      }))}
      sections={sections}
      items={items}
    />
  );
}
