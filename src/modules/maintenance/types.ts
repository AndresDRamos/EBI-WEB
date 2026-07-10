import type { AssetListRow } from "@/modules/maintenance/db";
import type { LocationWithPlant } from "@/modules/org/db/locations";
import type { CellRow } from "@/modules/production/db";

/** Equipos cards/detail row. Derived from the DB read model, not
 * hand-declared, so a new `AssetListRow` column doesn't silently drift out
 * of sync. `installation_date` is re-typed `Date -> string` (ISO) and
 * `cell_names` is joined in separately (not part of `AssetListRow`). */
export type MachineRow = Pick<
  AssetListRow,
  | "asset_id"
  | "code"
  | "name"
  | "brand"
  | "model"
  | "serial_number"
  | "location_id"
  | "location_name"
  | "plant_id"
  | "plant_name"
  | "asset_type_id"
  | "type_name"
  | "category_name"
  | "parent_asset_id"
  | "image_blob_path"
  | "notes"
  | "process_names"
  | "is_active"
> & {
  installation_date: string | null;
  cell_names: string[];
};

/** Plant location option (org.location) — the asset's physical home. */
export type LocationOption = Pick<
  LocationWithPlant,
  "location_id" | "plant_id" | "plant_name" | "name"
>;

/** Production cell option, with its location for the location-match filter. */
export type CellOption = Pick<CellRow, "cell_id" | "code" | "name"> & {
  location_id: number | null;
};

/** Candidate parent assets, with enough data to render the read-only preview
 * (`ParentPickerModal`'s compact copy of the equipment summary). */
export type ParentOption = Pick<
  AssetListRow,
  | "asset_id"
  | "code"
  | "name"
  | "brand"
  | "model"
  | "serial_number"
  | "category_name"
  | "type_name"
  | "plant_name"
  | "location_name"
> & {
  cell_names: string[];
  has_image: boolean;
};
