import { listPlants } from "@/lib/db/org";
import { PlantsTablePage, type PlantsTableRow } from "@/components/admin/plants-table-page";

export const dynamic = "force-dynamic";

/** Plantas admin sub-page — CRUD with address + postal_code. */
export default async function AdminPlantsPage() {
  const plants = await listPlants().catch(() => []);

  const rows: PlantsTableRow[] = plants.map((p) => ({
    plant_id: p.plant_id,
    code: p.code,
    name: p.name,
    address: p.address,
    postal_code: p.postal_code,
    is_active: p.is_active,
  }));

  return <PlantsTablePage plants={rows} />;
}