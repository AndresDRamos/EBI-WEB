import { listAssets } from "@/lib/db/maint";
import { listPlants } from "@/lib/db/org";
import { isAdmin } from "@/lib/auth/rbac";
import {
  MachinesTablePage,
  type MachinesTableRow,
} from "@/components/maintenance/machines-table-page";

export const dynamic = "force-dynamic";

/** Equipos — maintenance asset catalog list. */
export default async function MachinesPage() {
  const [assets, plants, canManage] = await Promise.all([
    listAssets().catch(() => []),
    listPlants(true).catch(() => []),
    isAdmin(),
  ]);

  const rows: MachinesTableRow[] = assets.map((a) => ({
    asset_id: a.asset_id,
    code: a.code,
    name: a.name,
    brand: a.brand,
    model: a.model,
    serial_number: a.serial_number,
    plant_id: a.plant_id,
    plant_name: a.plant_name,
    location: a.location,
    criticality: a.criticality,
    status: a.status,
    parent_asset_id: a.parent_asset_id,
    acquisition_date: a.acquisition_date
      ? a.acquisition_date.toISOString()
      : null,
    notes: a.notes,
    process_names: a.process_names,
    is_active: a.is_active,
  }));

  return (
    <MachinesTablePage
      machines={rows}
      plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
      canManage={canManage}
    />
  );
}
