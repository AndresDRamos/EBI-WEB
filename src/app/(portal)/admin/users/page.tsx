import { listUsersWithNames } from "@/modules/org/db/users";
import { listRoles, listPlants, listDepartments } from "@/modules/org/db/org";
import { UsersTablePage, type UsersTableRow } from "@/modules/org/components/users-table-page";
import type { CatalogItem } from "@/modules/org/components/user-form";

export const dynamic = "force-dynamic";

/**
 * Usuarios admin sub-page. Loads the full result set server-side and renders a
 * single generic DataTable (Nombre/Usuario/Departamento(s)/Rol(es)/Planta(s))
 * with the reused UserFormDialog for create/edit.
 */
export default async function AdminUsersPage() {
  const [users, roles, plants, departments] = await Promise.all([
    listUsersWithNames().catch(() => []),
    listRoles().catch(() => []),
    listPlants().catch(() => []),
    listDepartments().catch(() => []),
  ]);

  const rows: UsersTableRow[] = users.map((u) => ({
    user_id: u.user_id,
    username: u.username,
    display_name: u.display_name,
    all_plants: u.all_plants,
    is_active: u.is_active,
    roles: u.roles,
    plant_names: u.plant_names.map((p) => p.name),
    department_names: u.department_names.map((d) => d.name),
  }));

  const roleCatalog: CatalogItem[] = roles.map((r) => ({
    id: r.role_id,
    label: r.name,
  }));
  const plantCatalog: CatalogItem[] = plants.map((p) => ({
    id: p.plant_id,
    label: `${p.code} · ${p.name}`,
  }));
  const deptCatalog: CatalogItem[] = departments.map((d) => ({
    id: d.department_id,
    label: d.name,
  }));

  return (
    <UsersTablePage
      users={rows}
      roles={roleCatalog}
      plants={plantCatalog}
      departments={deptCatalog}
    />
  );
}