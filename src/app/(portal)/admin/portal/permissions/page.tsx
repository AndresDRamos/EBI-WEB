import { listRoles } from "@/modules/org/db/org";
import { listPermissions } from "@/modules/org/db/permissions";
import { PermissionMatrixPanel } from "@/modules/org/components/permission-matrix-panel";

export const dynamic = "force-dynamic";

/**
 * Permisos tab (Portal): `<module>.<resource>:<action>` matrix per role. The
 * catalog is migration-seeded (V8); this screen only grants/revokes.
 */
export default async function AdminPermissionsPage() {
  const [profiles, permissions] = await Promise.all([
    listRoles(true).catch(() => []),
    listPermissions().catch(() => []),
  ]);

  return (
    <PermissionMatrixPanel
      profiles={profiles.map((r) => ({ role_id: r.role_id, name: r.name }))}
      permissions={permissions.map((p) => ({
        permission_id: p.permission_id,
        code: p.code,
        description: p.description,
      }))}
    />
  );
}
