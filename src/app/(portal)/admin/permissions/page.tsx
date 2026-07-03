import { KeyRound } from "lucide-react";
import { listRoles } from "@/modules/org/db/org";
import { listPermissions } from "@/modules/org/db/permissions";
import { PermissionGrantsPanel } from "@/modules/org/components/permission-grants-panel";

export const dynamic = "force-dynamic";

/**
 * Permisos por acción (plan 0006): assign `<module>.<resource>:<action>`
 * permissions to access profiles. The catalog is migration-seeded (V8);
 * this screen only grants/revokes — mirror of /admin/access for nav.
 */
export default async function AdminPermissionsPage() {
  const [profiles, permissions] = await Promise.all([
    listRoles(true).catch(() => []),
    listPermissions().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <KeyRound className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Permisos por acción</h1>
          <p className="text-sm text-muted-foreground">
            Qué acciones puede ejecutar cada perfil de acceso. El servidor
            re-verifica cada permiso en cada request.
          </p>
        </div>
      </header>

      <PermissionGrantsPanel
        profiles={profiles.map((r) => ({ role_id: r.role_id, name: r.name }))}
        permissions={permissions.map((p) => ({
          permission_id: p.permission_id,
          code: p.code,
          description: p.description,
        }))}
      />
    </div>
  );
}
