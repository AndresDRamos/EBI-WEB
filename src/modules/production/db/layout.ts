import "server-only";
import type { Selectable } from "kysely";
import type { PlantLayout } from "@/lib/db/types";
import { db, emptyToNull, plantNamesById } from "./shared";

/**
 * `production.plant_layout` — immutable, versioned canvas per plant. The only
 * legitimate mutations are lifecycle transitions (draft → active → archived);
 * geometry is NEVER updated in place — a correction is a new draft (ADR 0006).
 * List queries deliberately exclude the `geometry` LOB (V13 discipline).
 */

export type LayoutRow = Selectable<PlantLayout>;

/** List projection: everything except the geometry LOB. */
export interface LayoutListRow {
  layout_id: number;
  plant_id: number;
  plant_name: string;
  version: number;
  name: string;
  note: string | null;
  source_blob_path: string;
  width_m: number;
  height_m: number;
  status: string;
  created_by: number;
  created_at: Date;
  activated_at: Date | null;
  archived_at: Date | null;
}

const LIST_COLUMNS = [
  "layout_id",
  "plant_id",
  "version",
  "name",
  "note",
  "source_blob_path",
  "width_m",
  "height_m",
  "status",
  "created_by",
  "created_at",
  "activated_at",
  "archived_at",
] as const;

export async function listLayouts(plantId?: number): Promise<LayoutListRow[]> {
  let q = db.selectFrom("plant_layout").select(LIST_COLUMNS);
  if (plantId !== undefined) q = q.where("plant_id", "=", plantId);
  const rows = await q
    .orderBy("plant_id", "asc")
    .orderBy("version", "desc")
    .execute();
  if (rows.length === 0) return [];
  const plantNames = await plantNamesById([
    ...new Set(rows.map((r) => r.plant_id)),
  ]);
  return rows.map((r) => ({
    ...r,
    plant_name: plantNames.get(r.plant_id) ?? "",
  }));
}

export async function findLayoutById(
  id: number,
): Promise<LayoutRow | undefined> {
  const row = await db
    .selectFrom("plant_layout")
    .selectAll()
    .where("layout_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

/** The plant's single active layout (UQ_plant_layout_active), if any. */
export async function findActiveLayout(
  plantId: number,
): Promise<LayoutRow | undefined> {
  const row = await db
    .selectFrom("plant_layout")
    .selectAll()
    .where("plant_id", "=", plantId)
    .where("status", "=", "active")
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreateDraftInput {
  plant_id: number;
  name: string;
  note?: string | null;
  source_blob_path: string;
  width_m: number;
  height_m: number;
  /** Normalized geometry JSON, already serialized (ISJSON-checked by the DB). */
  geometry: string;
  created_by: number;
}

/** Insert a draft as the plant's next version number. */
export async function createDraft(input: CreateDraftInput): Promise<LayoutRow> {
  return db.transaction().execute(async (trx) => {
    const max = await trx
      .selectFrom("plant_layout")
      .select(({ fn }) => fn.max("version").as("v"))
      .where("plant_id", "=", input.plant_id)
      .executeTakeFirst();
    const version = (max?.v ?? 0) + 1;
    const inserted = await trx
      .insertInto("plant_layout")
      .values({
        plant_id: input.plant_id,
        version,
        name: input.name.trim(),
        note: emptyToNull(input.note),
        source_blob_path: input.source_blob_path,
        width_m: input.width_m,
        height_m: input.height_m,
        geometry: input.geometry,
        created_by: input.created_by,
      })
      .output("inserted.layout_id")
      .executeTakeFirst();
    if (!inserted) throw new Error("Layout insert returned no identity");
    const row = await trx
      .selectFrom("plant_layout")
      .selectAll()
      .where("layout_id", "=", inserted.layout_id)
      .executeTakeFirst();
    if (!row) throw new Error("Layout not found after insert");
    return row;
  });
}

export type ActivateResult =
  | { outcome: "activated"; layout: LayoutRow; carriedPlacements: number }
  | { outcome: "not-found" }
  | { outcome: "not-draft"; status: string };

/**
 * Confirm a draft — ONE transaction (approved carry-forward, 2026-07-06):
 * archive the plant's previous active version, close its open placements,
 * activate the draft, and re-open identical placement rows on the new
 * version. `actorId` authors the carried rows (they are new facts created by
 * this confirmation, not copies of old authorship).
 */
export async function activateDraft(
  layoutId: number,
  actorId: number,
): Promise<ActivateResult> {
  return db.transaction().execute(async (trx) => {
    const draft = await trx
      .selectFrom("plant_layout")
      .selectAll()
      .where("layout_id", "=", layoutId)
      .executeTakeFirst();
    if (!draft) return { outcome: "not-found" as const };
    if (draft.status !== "draft")
      return { outcome: "not-draft" as const, status: draft.status };

    const now = new Date();
    const today = new Date();
    let carried = 0;

    const previous = await trx
      .selectFrom("plant_layout")
      .selectAll()
      .where("plant_id", "=", draft.plant_id)
      .where("status", "=", "active")
      .executeTakeFirst();

    if (previous) {
      const openPlacements = await trx
        .selectFrom("asset_placement")
        .selectAll()
        .where("layout_id", "=", previous.layout_id)
        .where("valid_to", "is", null)
        .execute();

      await trx
        .updateTable("asset_placement")
        .set({ valid_to: today })
        .where("layout_id", "=", previous.layout_id)
        .where("valid_to", "is", null)
        .execute();

      // Archive BEFORE activating: UQ_plant_layout_active would otherwise see
      // two active rows for the plant mid-transaction.
      await trx
        .updateTable("plant_layout")
        .set({ status: "archived", archived_at: now })
        .where("layout_id", "=", previous.layout_id)
        .execute();

      if (openPlacements.length > 0) {
        await trx
          .insertInto("asset_placement")
          .values(
            openPlacements.map((p) => ({
              layout_id: draft.layout_id,
              asset_id: p.asset_id,
              x_m: p.x_m,
              y_m: p.y_m,
              rotation_deg: p.rotation_deg,
              note: p.note,
              created_by: actorId,
            })),
          )
          .execute();
        carried = openPlacements.length;
      }
    }

    await trx
      .updateTable("plant_layout")
      .set({ status: "active", activated_at: now })
      .where("layout_id", "=", draft.layout_id)
      .execute();

    const layout = await trx
      .selectFrom("plant_layout")
      .selectAll()
      .where("layout_id", "=", draft.layout_id)
      .executeTakeFirst();
    if (!layout) throw new Error("Layout not found after activation");
    return {
      outcome: "activated" as const,
      layout,
      carriedPlacements: carried,
    };
  });
}

export type ArchiveResult =
  | { outcome: "archived"; closedPlacements: number }
  | { outcome: "not-found" }
  | { outcome: "not-active"; status: string };

/**
 * Retire the active layout WITHOUT a successor. Its open placements close —
 * the plant has no canvas, so nothing is "currently placed".
 */
export async function archiveActive(layoutId: number): Promise<ArchiveResult> {
  return db.transaction().execute(async (trx) => {
    const layout = await trx
      .selectFrom("plant_layout")
      .selectAll()
      .where("layout_id", "=", layoutId)
      .executeTakeFirst();
    if (!layout) return { outcome: "not-found" as const };
    if (layout.status !== "active")
      return { outcome: "not-active" as const, status: layout.status };

    const closed = await trx
      .updateTable("asset_placement")
      .set({ valid_to: new Date() })
      .where("layout_id", "=", layoutId)
      .where("valid_to", "is", null)
      .executeTakeFirst();
    await trx
      .updateTable("plant_layout")
      .set({ status: "archived", archived_at: new Date() })
      .where("layout_id", "=", layoutId)
      .execute();
    return {
      outcome: "archived" as const,
      closedPlacements: Number(closed.numUpdatedRows),
    };
  });
}

export type DiscardResult =
  | { outcome: "discarded" }
  | { outcome: "not-found" }
  | { outcome: "not-draft"; status: string };

/**
 * Hard-delete a draft (never an active/archived version — those are history).
 * A draft may already carry trial placements; they go with it.
 */
export async function discardDraft(layoutId: number): Promise<DiscardResult> {
  return db.transaction().execute(async (trx) => {
    const layout = await trx
      .selectFrom("plant_layout")
      .select(["layout_id", "status"])
      .where("layout_id", "=", layoutId)
      .executeTakeFirst();
    if (!layout) return { outcome: "not-found" as const };
    if (layout.status !== "draft")
      return { outcome: "not-draft" as const, status: layout.status };

    await trx
      .deleteFrom("asset_placement")
      .where("layout_id", "=", layoutId)
      .execute();
    await trx
      .deleteFrom("plant_layout")
      .where("layout_id", "=", layoutId)
      .execute();
    return { outcome: "discarded" as const };
  });
}
