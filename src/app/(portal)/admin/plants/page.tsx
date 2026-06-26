import { redirect } from "next/navigation";
import { Factory } from "lucide-react";
import { listPlants } from "@/lib/db/org";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";
import { AdminNav } from "@/components/admin/admin-nav";
import { PlantsManager } from "@/components/admin/plants-manager";

export const dynamic = "force-dynamic";

export default async function AdminPlantsPage() {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/dashboards");

  const plants = await listPlants().catch(() => []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <Factory className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Plantas</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de plantas. Asigna a los usuarios para acotar su alcance
            de datos (futuro RLS vía Power BI).
          </p>
        </div>
      </header>

      <AdminNav />

      <PlantsManager
        plants={plants.map((p) => ({
          plant_id: p.plant_id,
          code: p.code,
          name: p.name,
          is_active: p.is_active,
        }))}
      />
    </div>
  );
}