import {
  listAssets,
  listAssetCategories,
  listAssetTypes,
} from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import { listLocations } from "@/modules/org/db/locations";
import { listCells, currentCellNamesByAssets } from "@/modules/production/db";
import type {
  PlantOption,
  TypeOption,
} from "@/modules/maintenance/components/machine-form-dialog";
import type {
  CellOption,
  LocationOption,
  MachineRow,
  ParentOption,
} from "@/modules/maintenance/types";

export interface MachinesCatalogViewModel {
  rows: MachineRow[];
  parents: ParentOption[];
  plants: PlantOption[];
  locations: LocationOption[];
  cells: CellOption[];
  types: TypeOption[];
}

/**
 * Equipos catalog data: the asset list (as `MachineRow`), every active asset
 * as a `ParentOption` candidate (for the "Equipo padre" picker), and the
 * filter/form option lists. Shared by the cards page
 * (`(portal)/maintenance/machines`) and the QR landing page
 * (`asset/[code]`), which both render the same modal surface off the same
 * shape. Catalog sizes keep computing `parents` unconditionally cheap.
 */
export async function getMachinesCatalogViewModel(): Promise<MachinesCatalogViewModel> {
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

  const parents: ParentOption[] = assets
    .filter((a) => a.is_active)
    .map((a) => ({
      asset_id: a.asset_id,
      code: a.code,
      name: a.name,
      brand: a.brand,
      model: a.model,
      serial_number: a.serial_number,
      category_name: a.category_name,
      type_name: a.type_name,
      plant_name: a.plant_name,
      location_name: a.location_name,
      cell_names: cellNames.get(a.asset_id) ?? [],
      has_image: a.image_blob_path !== null,
    }));

  return {
    rows,
    parents,
    plants: plants.map((p) => ({ plant_id: p.plant_id, name: p.name })),
    locations: locations.map((l) => ({
      location_id: l.location_id,
      plant_id: l.plant_id,
      plant_name: l.plant_name,
      name: l.name,
    })),
    cells: cells.map((c) => ({
      cell_id: c.cell_id,
      code: c.code,
      name: c.name,
      location_id: c.location_id,
    })),
    types: typeOptions,
  };
}
