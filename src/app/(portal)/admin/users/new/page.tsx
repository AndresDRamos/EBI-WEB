import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { listRoles, listPlants, listDepartments } from "@/lib/db/org";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";
import { UserForm } from "@/components/admin/user-form";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/dashboards");

  const [roles, plants, departments] = await Promise.all([
    listRoles().catch(() => []),
    listPlants().catch(() => []),
    listDepartments().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex items-center gap-3">
        <UserPlus className="h-6 w-6 text-ezi-orange" />
        <h1 className="text-2xl font-bold">Nuevo usuario</h1>
      </header>
      <UserForm
        roles={roles.map((r) => ({ id: r.role_id, label: r.name }))}
        plants={plants.map((p) => ({ id: p.plant_id, label: `${p.code} · ${p.name}` }))}
        departments={departments.map((d) => ({ id: d.department_id, label: d.name }))}
      />
    </div>
  );
}