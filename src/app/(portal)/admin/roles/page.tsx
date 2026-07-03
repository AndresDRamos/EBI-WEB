import { listRoles, listDepartments } from "@/modules/org/db/org";
import { RolesTablePage, type RolesTableRow } from "@/modules/org/components/roles-table-page";

export const dynamic = "force-dynamic";

/** Perfiles de acceso admin sub-page (rol = perfil desde V8 / ADR 0004). */
export default async function AdminRolesPage() {
  const [roles, departments] = await Promise.all([
    listRoles().catch(() => []),
    listDepartments(true).catch(() => []),
  ]);

  const rows: RolesTableRow[] = roles.map((r) => ({
    role_id: r.role_id,
    name: r.name,
    description: r.description,
    department_id: r.department_id,
    department_name: r.department_name,
    is_active: r.is_active,
  }));

  return (
    <RolesTablePage
      roles={rows}
      departments={departments.map((d) => ({
        department_id: d.department_id,
        name: d.name,
      }))}
    />
  );
}
