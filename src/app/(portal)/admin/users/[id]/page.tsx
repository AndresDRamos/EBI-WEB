import { notFound, redirect } from "next/navigation";
import { UserCog } from "lucide-react";
import { getUserDetail } from "@/lib/db/users";
import { listRoles, listPlants, listDepartments } from "@/lib/db/org";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";
import { UserForm } from "@/components/admin/user-form";

export const dynamic = "force-dynamic";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/dashboards");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getUserDetail(id).catch(() => undefined);
  if (!detail) notFound();

  const [roles, plants, departments] = await Promise.all([
    listRoles().catch(() => []),
    listPlants().catch(() => []),
    listDepartments().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex items-center gap-3">
        <UserCog className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Editar usuario</h1>
          <p className="text-sm text-muted-foreground">
            Ajuste roles, plantas, departamentos y estado de la cuenta.
          </p>
        </div>
      </header>
      <UserForm
        roles={roles.map((r) => ({ id: r.role_id, label: r.name }))}
        plants={plants.map((p) => ({ id: p.plant_id, label: `${p.code} · ${p.name}` }))}
        departments={departments.map((d) => ({ id: d.department_id, label: d.name }))}
        initial={{
          user_id: detail.user_id,
          username: detail.username,
          email: detail.email,
          display_name: detail.display_name,
          all_plants: detail.all_plants,
          is_active: detail.is_active,
          role_ids: detail.roles.map((r) => r.role_id),
          plant_ids: detail.plants.map((p) => p.plant_id),
          department_ids: detail.departments.map((d) => d.department_id),
        }}
      />
    </div>
  );
}