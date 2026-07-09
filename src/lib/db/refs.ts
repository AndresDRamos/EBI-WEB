import "server-only";
import { orgDb, maintDb } from "./schema-clients";

/**
 * Cross-schema reference lookups shared by `maintenance` and `production`:
 * plant/location come from `org`, asset identity from `maint`. A typed
 * cross-schema join is not expressible with the flattened codegen keys (each
 * client binds one schema), so these run as separate per-schema queries
 * merged in JS. Catalog sizes make this a non-issue.
 */

export interface LocationRef {
  code: string;
  name: string;
  plant_id: number;
  plant_code: string;
  plant_name: string;
}

/** Location refs (name + owning plant) by id — since V18/V19 an asset's or
 * cell's plant is DERIVED via its location (the direct `plant_id` FK was
 * dropped from both tables). */
export async function locationRefsById(
  ids: number[],
): Promise<Map<number, LocationRef>> {
  if (ids.length === 0) return new Map();
  const rows = await orgDb
    .selectFrom("location")
    .innerJoin("plant", "plant.plant_id", "location.plant_id")
    .select([
      "location.location_id",
      "location.code",
      "location.name",
      "location.plant_id",
      "plant.code as plant_code",
      "plant.name as plant_name",
    ])
    .where("location.location_id", "in", ids)
    .execute();
  return new Map(
    rows.map((r) => [
      r.location_id,
      {
        code: r.code,
        name: r.name,
        plant_id: r.plant_id,
        plant_code: r.plant_code,
        plant_name: r.plant_name,
      },
    ]),
  );
}

/** Process names by id, from `org.process` (the company-wide catalog). */
export async function processNamesById(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await orgDb
    .selectFrom("process")
    .select(["process_id", "name"])
    .where("process_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.process_id, r.name]));
}

export interface AssetRef {
  code: string;
  name: string;
  model: string | null;
  serial_number: string | null;
  has_image: boolean;
}

/** Asset identity refs by id, from `maint.asset`. */
export async function assetRefsById(ids: number[]): Promise<Map<number, AssetRef>> {
  if (ids.length === 0) return new Map();
  const rows = await maintDb
    .selectFrom("asset")
    .select(["asset_id", "code", "name", "model", "serial_number", "image_blob_path"])
    .where("asset_id", "in", ids)
    .execute();
  return new Map(
    rows.map((r) => [
      r.asset_id,
      {
        code: r.code,
        name: r.name,
        model: r.model,
        serial_number: r.serial_number,
        has_image: r.image_blob_path !== null,
      },
    ]),
  );
}
