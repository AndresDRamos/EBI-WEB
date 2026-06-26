import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { listDepartments } from "@/lib/db/org";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";
import { AdminNav } from "@/components/admin/admin-nav";
import { DepartmentsManager } from "@/components/admin/departments-manager";

export const dynamic = "force-dynamic";

export default async function AdminDepartmentsPage() {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/dashboards");

  const departments = await listDepartments().catch(() => []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Departamentos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de departamentos asignable a los usuarios.
          </p>
        </div>
      </header>

      <AdminNav />

      <DepartmentsManager
        departments={departments.map((d) => ({
          department_id: d.department_id,
          name: d.name,
          is_active: d.is_active,
        }))}
      />
    </div>
  );
}