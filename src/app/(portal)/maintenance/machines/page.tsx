import { listAssets } from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import { currentCellNamesByAssets } from "@/modules/production/db";
import {
  MachinesCardsPage,
  type MachineRow,
} from "@/modules/maintenance/components/machines-cards-page";

export const dynamic = "force-dynamic";

/** Equipos — maintenance asset catalog as cards. Action visibility is resolved
 * client-side by `useCan` (PermissionsProvider in the portal layout). */
export default async function MachinesPage() {
  const [assets, plants] = await Promise.all([
    listAssets().catch(() => []),
    listPlants(true).catch(() => []),
  ]);
  const cellNames = await currentCellNamesByAssets(
    assets.map((a) => a.asset_id),
  ).catch(() => new Map<number, string[]>());

  const rows: MachineRow[] = assets.map((a) => ({
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
    asset_category: a.asset_category,
    parent_asset_id: a.parent_asset_id,
    acquisition_date: a.acquisition_date
      ? a.acquisition_date.toISOString()
      : null,
    notes: a.notes,
    process_names: a.process_names,
    cell_names: cellNames.get(a.asset_id) ?? [],
    is_active: a.is_active,
  }));

  return (
    <MachinesCardsPage
      machines={rows}
      plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
    />
  );
}
