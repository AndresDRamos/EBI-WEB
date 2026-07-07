import "server-only";
import type { Selectable } from "kysely";
import type { AssetPlacement } from "@/lib/db/types";
import { assetRefsById, db, emptyToNull } from "./shared";

/**
 * `production.asset_placement` — TEMPORAL position of an asset on a layout.
 * Same invariant family as `asset_cell_assignment`: reposition = close the
 * current row + insert a new one in ONE transaction; x/y/rotation are never
 * UPDATEd in place, and the table has NO updated_at on purpose.
 * UQ_asset_placement_current: one CURRENT row per (layout, asset).
 */

export type PlacementRow = Selectable<AssetPlacement>;

export interface PlacementWithAsset extends PlacementRow {
  asset_code: string;
  asset_name: string;
}

export async function findPlacementById(
  id: number,
): Promise<PlacementRow | undefined> {
  const row = await db
    .selectFrom("asset_placement")
    .selectAll()
    .where("placement_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

/** Placements of one layout: current only, or full history (newest first). */
export async function listByLayout(
  layoutId: number,
  opts: { currentOnly?: boolean } = {},
): Promise<PlacementWithAsset[]> {
  let q = db
    .selectFrom("asset_placement")
    .selectAll()
    .where("layout_id", "=", layoutId);
  if (opts.currentOnly) q = q.where("valid_to", "is", null);
  const rows = await q
    .orderBy("valid_from", "desc")
    .orderBy("placement_id", "desc")
    .execute();
  return withAssetRefs(rows);
}

export interface CreatePlacementInput {
  layout_id: number;
  asset_id: number;
  x_m: number;
  y_m: number;
  rotation_deg?: number;
  note?: string | null;
  created_by: number;
}

export async function createPlacement(
  input: CreatePlacementInput,
): Promise<PlacementRow> {
  const inserted = await db
    .insertInto("asset_placement")
    .values({
      layout_id: input.layout_id,
      asset_id: input.asset_id,
      x_m: input.x_m,
      y_m: input.y_m,
      ...(input.rotation_deg !== undefined
        ? { rotation_deg: input.rotation_deg }
        : {}),
      note: emptyToNull(input.note),
      created_by: input.created_by,
    })
    .output("inserted.placement_id")
    .executeTakeFirst();
  if (!inserted) throw new Error("Placement insert returned no identity");
  const row = await findPlacementById(inserted.placement_id);
  if (!row) throw new Error("Placement not found after insert");
  return row;
}

/**
 * Close the placement only if it is still current. `false` = already closed
 * (API 409); a missing row is the caller's 404 (findPlacementById first).
 */
export async function closePlacement(
  id: number,
  validTo?: Date,
): Promise<boolean> {
  const result = await db
    .updateTable("asset_placement")
    .set({ valid_to: validTo ?? new Date() })
    .where("placement_id", "=", id)
    .where("valid_to", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export interface MovePoseInput {
  placement_id: number;
  x_m: number;
  y_m: number;
  rotation_deg: number;
  note?: string | null;
  created_by: number;
}

/**
 * Historized move on the same layout (the `reassign` analogue): close the
 * current row and insert the new pose in one transaction. Returns the new
 * row, or undefined when the source is missing/already closed (404/409).
 */
export async function movePose(
  input: MovePoseInput,
): Promise<PlacementRow | undefined> {
  return db.transaction().execute(async (trx) => {
    const source = await trx
      .selectFrom("asset_placement")
      .selectAll()
      .where("placement_id", "=", input.placement_id)
      .executeTakeFirst();
    if (!source || source.valid_to !== null) return undefined;

    await trx
      .updateTable("asset_placement")
      .set({ valid_to: new Date() })
      .where("placement_id", "=", input.placement_id)
      .where("valid_to", "is", null)
      .execute();
    const inserted = await trx
      .insertInto("asset_placement")
      .values({
        layout_id: source.layout_id,
        asset_id: source.asset_id,
        x_m: input.x_m,
        y_m: input.y_m,
        rotation_deg: input.rotation_deg,
        note: emptyToNull(input.note),
        created_by: input.created_by,
      })
      .output("inserted.placement_id")
      .executeTakeFirst();
    if (!inserted) throw new Error("Move insert returned no identity");
    const row = await trx
      .selectFrom("asset_placement")
      .selectAll()
      .where("placement_id", "=", inserted.placement_id)
      .executeTakeFirst();
    if (!row) throw new Error("Move not found after insert");
    return row;
  });
}

async function withAssetRefs(
  rows: PlacementRow[],
): Promise<PlacementWithAsset[]> {
  if (rows.length === 0) return [];
  const refs = await assetRefsById([...new Set(rows.map((r) => r.asset_id))]);
  return rows.map((r) => ({
    ...r,
    asset_code: refs.get(r.asset_id)?.code ?? "",
    asset_name: refs.get(r.asset_id)?.name ?? "",
  }));
}
