import { listDepartments } from "@/modules/org/db/org";
import { DepartmentsTablePage, type DepartmentsTableRow } from "@/modules/org/components/departments-table-page";

export const dynamic = "force-dynamic";

/** Departamentos admin sub-page — CRUD with description. */
export default async function AdminDepartmentsPage() {
  const departments = await listDepartments().catch(() => []);

  const rows: DepartmentsTableRow[] = departments.map((d) => ({
    department_id: d.department_id,
    name: d.name,
    description: d.description,
    is_active: d.is_active,
  }));

  return <DepartmentsTablePage departments={rows} />;
}