export interface PlantOption {
  plant_id: number;
  name: string;
}

/** Asset type option with its parent category (for the grouped select) and
 * its type-level processes (V18 — shown read-only on the asset). */
export interface TypeOption {
  asset_type_id: number;
  name: string;
  asset_category_id: number;
  category_name: string;
  process_names: string[];
}

export interface ProcessOption {
  process_id: number;
  code: string;
  name: string;
}

/** Subset of asset fields the equipment modal edits (create + edit share the same state). */
export interface MachineFormAsset {
  asset_id: number;
  /** Auto-generated matrícula — display-only, never edited by the client. */
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  /** The asset's physical home (org.location); the plant derives from it. */
  location_id: number;
  asset_type_id: number;
  parent_asset_id: number | null;
  installation_date: string | null;
  image_blob_path: string | null;
  notes: string | null;
}
