import "server-only";
import type { Selectable } from "kysely";
import type { AssetFootprint } from "@/lib/db/types";
import { assetRefsById, db, emptyToNull } from "./shared";

/**
 * `production.asset_footprint` — ONE top-view shape per asset
 * (UQ_asset_footprint_asset). Unlike placements, footprints are editable in
 * place: the shape is presentation, not history (V13 rationale).
 */

export type FootprintRow = Selectable<AssetFootprint>;

export interface FootprintWithAsset extends FootprintRow {
  asset_code: string;
  asset_name: string;
}

export async function findFootprintByAsset(
  assetId: number,
): Promise<FootprintRow | undefined> {
  const row = await db
    .selectFrom("asset_footprint")
    .selectAll()
    .where("asset_id", "=", assetId)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function listFootprints(): Promise<FootprintWithAsset[]> {
  const rows = await db.selectFrom("asset_footprint").selectAll().execute();
  return withAssetRefs(rows);
}

/** Footprints for a set of assets (editor/viewer composition). */
export async function listFootprintsByAssets(
  assetIds: number[],
): Promise<FootprintRow[]> {
  if (assetIds.length === 0) return [];
  return db
    .selectFrom("asset_footprint")
    .selectAll()
    .where("asset_id", "in", assetIds)
    .execute();
}

export interface UpsertFootprintInput {
  asset_id: number;
  width_m: number;
  depth_m: number;
  /** Normalized geometry JSON, already serialized. */
  geometry: string;
  source_kind: "dxf" | "rectangle";
  source_blob_path?: string | null;
  created_by: number;
}

/** Create or replace the asset's footprint (one per asset, edit-in-place). */
export async function upsertFootprint(
  input: UpsertFootprintInput,
): Promise<FootprintRow> {
  const existing = await findFootprintByAsset(input.asset_id);
  if (existing) {
    await db
      .updateTable("asset_footprint")
      .set({
        width_m: input.width_m,
        depth_m: input.depth_m,
        geometry: input.geometry,
        source_kind: input.source_kind,
        source_blob_path:
          input.source_kind === "dxf"
            ? emptyToNull(input.source_blob_path)
            : null,
        updated_at: new Date(),
      })
      .where("footprint_id", "=", existing.footprint_id)
      .execute();
  } else {
    await db
      .insertInto("asset_footprint")
      .values({
        asset_id: input.asset_id,
        width_m: input.width_m,
        depth_m: input.depth_m,
        geometry: input.geometry,
        source_kind: input.source_kind,
        source_blob_path:
          input.source_kind === "dxf"
            ? emptyToNull(input.source_blob_path)
            : null,
        created_by: input.created_by,
      })
      .execute();
  }
  const row = await findFootprintByAsset(input.asset_id);
  if (!row) throw new Error("Footprint not found after upsert");
  return row;
}

async function withAssetRefs(
  rows: FootprintRow[],
): Promise<FootprintWithAsset[]> {
  if (rows.length === 0) return [];
  const refs = await assetRefsById([...new Set(rows.map((r) => r.asset_id))]);
  return rows.map((r) => ({
    ...r,
    asset_code: refs.get(r.asset_id)?.code ?? "",
    asset_name: refs.get(r.asset_id)?.name ?? "",
  }));
}
