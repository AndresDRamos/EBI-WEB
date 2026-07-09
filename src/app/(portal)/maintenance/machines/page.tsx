import {
  listAssets,
  listAssetCategories,
  listAssetTypes,
} from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import { listLocations } from "@/modules/org/db/locations";
import { listCells, currentCellNamesByAssets } from "@/modules/production/db";
import { PageTabs } from "@/components/kit/page-tabs";
import {
  MachinesCardsPage,
  type MachineRow,
} from "@/modules/maintenance/components/machines-cards-page";
import { MACHINES_TABS } from "@/modules/maintenance/components/machines-tabs";
import type { TypeOption } from "@/modules/maintenance/components/machine-form-dialog";

export const dynamic = "force-dynamic";

/** Equipos — maintenance asset catalog as cards. Action visibility is resolved
 * client-side by `useCan` (PermissionsProvider in the portal layout). */
export default async function MachinesPage() {
  const [assets, plants, locations, cells, categories, types] = await Promise.all([
    listAssets().catch(() => []),
    listPlants(true).catch(() => []),
    listLocations(true).catch(() => []),
    listCells(true).catch(() => []),
    listAssetCategories(true).catch(() => []),
    listAssetTypes(true).catch(() => []),
  ]);
  const cellNames = await currentCellNamesByAssets(
    assets.map((a) => a.asset_id),
  ).catch(() => new Map<number, string[]>());

  const categoryName = new Map(
    categories.map((c) => [c.asset_category_id, c.name]),
  );
  const typeOptions: TypeOption[] = types
    .filter((t) => categoryName.has(t.asset_category_id))
    .map((t) => ({
      asset_type_id: t.asset_type_id,
      name: t.name,
      asset_category_id: t.asset_category_id,
      category_name: categoryName.get(t.asset_category_id) ?? "",
      process_names: t.process_names,
    }));

  const rows: MachineRow[] = assets.map((a) => ({
    asset_id: a.asset_id,
    code: a.code,
    name: a.name,
    brand: a.brand,
    model: a.model,
    serial_number: a.serial_number,
    location_id: a.location_id,
    location_name: a.location_name,
    plant_id: a.plant_id,
    plant_name: a.plant_name,
    asset_type_id: a.asset_type_id,
    type_name: a.type_name,
    category_name: a.category_name,
    parent_asset_id: a.parent_asset_id,
    installation_date: a.installation_date
      ? a.installation_date.toISOString()
      : null,
    image_blob_path: a.image_blob_path,
    notes: a.notes,
    process_names: a.process_names,
    cell_names: cellNames.get(a.asset_id) ?? [],
    is_active: a.is_active,
  }));

  return (
    <div className="flex h-full flex-col gap-4">
      <PageTabs tabs={MACHINES_TABS} />
      <div className="min-h-0 flex-1">
        <MachinesCardsPage
          machines={rows}
          plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
          locations={locations.map((l) => ({
            location_id: l.location_id,
            plant_id: l.plant_id,
            plant_name: l.plant_name,
            name: l.name,
          }))}
          cells={cells.map((c) => ({
            cell_id: c.cell_id,
            code: c.code,
            name: c.name,
            location_id: c.location_id,
          }))}
          types={typeOptions}
        />
      </div>
    </div>
  );
}
