import { listRoles } from "@/lib/db/org";
import { RolesTablePage, type RolesTableRow } from "@/components/admin/roles-table-page";

export const dynamic = "force-dynamic";

/** Roles admin sub-page. The `admin` role is protected at the app layer. */
export default async function AdminRolesPage() {
  const roles = await listRoles().catch(() => []);

  const rows: RolesTableRow[] = roles.map((r) => ({
    role_id: r.role_id,
    name: r.name,
    description: r.description,
    is_active: r.is_active,
  }));

  return <RolesTablePage roles={rows} />;
}