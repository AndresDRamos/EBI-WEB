import { listDepartments, listRoles } from "@/modules/org/db/org";
import {
  DepartmentsRolesPage,
  type DepartmentGroupRow,
  type RoleChildRow,
} from "@/modules/org/components/departments-roles-page";

export const dynamic = "force-dynamic";

/**
 * Departamentos y roles tab (Organización): one grouped table — departments
 * as parent groups, their roles (access profiles) as child rows. Replaces the
 * flat /admin/departments and /admin/roles pages.
 */
export default async function AdminDepartmentsRolesPage() {
  const [departments, roles] = await Promise.all([
    listDepartments().catch(() => []),
    listRoles().catch(() => []),
  ]);

  const groups: DepartmentGroupRow[] = departments.map((d) => ({
    department_id: d.department_id,
    name: d.name,
    description: d.description,
    is_active: d.is_active,
  }));

  const roleRows: RoleChildRow[] = roles.map((r) => ({
    role_id: r.role_id,
    name: r.name,
    description: r.description,
    department_id: r.department_id,
    is_active: r.is_active,
  }));

  return <DepartmentsRolesPage departments={groups} roles={roleRows} />;
}
