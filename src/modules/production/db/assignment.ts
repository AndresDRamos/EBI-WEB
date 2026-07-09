import "server-only";
import type { Selectable } from "kysely";
import type { AssetCellAssignment } from "@/lib/db/types";
import { db, emptyToNull } from "./shared";
import { assetRefsById } from "@/lib/db/refs";

/**
 * Asset ↔ cell assignments (temporal). Rows are immutable except closing
 * valid_to: a reassignment is close + insert, never an in-place UPDATE of
 * asset_id/cell_id. The filtered unique index UQ_asset_cell_assignment_current
 * blocks a duplicate CURRENT row per (asset, cell) pair.
 */

export type AssignmentRow = Selectable<AssetCellAssignment>;

/** Assignment joined with the asset's identity (for cell composition views). */
export interface AssignmentWithAsset extends AssignmentRow {
  asset_code: string;
  asset_name: string;
  asset_model: string | null;
  asset_serial_number: string | null;
  asset_has_image: boolean;
}

/** Assignment joined with the cell's code/name (for the asset Ubicación tab). */
export interface AssignmentWithCell extends AssignmentRow {
  cell_code: string;
  cell_name: string;
}

export async function findAssignmentById(
  id: number,
): Promise<AssignmentRow | undefined> {
  const row = await db
    .selectFrom("asset_cell_assignment")
    .selectAll()
    .where("assignment_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

/** Single join shared by every cell-name resolution path below — the query
 * used to be duplicated as a per-list second query (`withCellRefs`) and a
 * separate hand-rolled join (`currentCellNamesByAssets`); both now build on
 * this one base. */
function baseAssignmentWithCellQuery() {
  return db
    .selectFrom("asset_cell_assignment")
    .innerJoin("cell", "cell.cell_id", "asset_cell_assignment.cell_id")
    .selectAll("asset_cell_assignment")
    .select(["cell.code as cell_code", "cell.name as cell_name"]);
}

/** Current assignments of one asset (an asset may serve several cells). */
export async function listCurrentByAsset(
  assetId: number,
): Promise<AssignmentWithCell[]> {
  return baseAssignmentWithCellQuery()
    .where("asset_cell_assignment.asset_id", "=", assetId)
    .where("asset_cell_assignment.valid_to", "is", null)
    .orderBy("asset_cell_assignment.valid_from", "desc")
    .execute();
}

/** Full assignment history of one asset (closed rows included), newest first. */
export async function listHistoryByAsset(
  assetId: number,
): Promise<AssignmentWithCell[]> {
  return baseAssignmentWithCellQuery()
    .where("asset_cell_assignment.asset_id", "=", assetId)
    .orderBy("asset_cell_assignment.valid_from", "desc")
    .orderBy("asset_cell_assignment.assignment_id", "desc")
    .execute();
}

/** Current cell names per asset, batched (machines cards view). */
export async function currentCellNamesByAssets(
  assetIds: number[],
): Promise<Map<number, string[]>> {
  if (assetIds.length === 0) return new Map();
  const rows = await baseAssignmentWithCellQuery()
    .where("asset_cell_assignment.valid_to", "is", null)
    .where("asset_cell_assignment.asset_id", "in", assetIds)
    .orderBy("cell.name", "asc")
    .execute();
  const map = new Map<number, string[]>();
  for (const r of rows) {
    const arr = map.get(r.asset_id) ?? [];
    arr.push(r.cell_name);
    map.set(r.asset_id, arr);
  }
  return map;
}

/** Current composition + closed history for a cell, with asset identity
 * resolved (cell detail page). */
export async function listAssignmentsForCell(
  cellId: number,
): Promise<{ current: AssignmentWithAsset[]; history: AssignmentWithAsset[] }> {
  const assignments = await db
    .selectFrom("asset_cell_assignment")
    .selectAll()
    .where("cell_id", "=", cellId)
    .orderBy("valid_from", "desc")
    .orderBy("assignment_id", "desc")
    .execute();
  const assetRefs = await assetRefsById([
    ...new Set(assignments.map((a) => a.asset_id)),
  ]);
  const withAsset: AssignmentWithAsset[] = assignments.map((a) => ({
    ...a,
    asset_code: assetRefs.get(a.asset_id)?.code ?? "",
    asset_name: assetRefs.get(a.asset_id)?.name ?? "",
    asset_model: assetRefs.get(a.asset_id)?.model ?? null,
    asset_serial_number: assetRefs.get(a.asset_id)?.serial_number ?? null,
    asset_has_image: assetRefs.get(a.asset_id)?.has_image ?? false,
  }));
  return {
    current: withAsset.filter((a) => a.valid_to === null),
    history: withAsset.filter((a) => a.valid_to !== null),
  };
}

export interface AssignInput {
  asset_id: number;
  cell_id: number;
  role_label?: string | null;
  valid_from?: Date | null;
  note?: string | null;
  created_by: number;
}

export async function assign(input: AssignInput): Promise<AssignmentRow> {
  const result = await db
    .insertInto("asset_cell_assignment")
    .values({
      asset_id: input.asset_id,
      cell_id: input.cell_id,
      role_label: emptyToNull(input.role_label),
      ...(input.valid_from ? { valid_from: input.valid_from } : {}),
      note: emptyToNull(input.note),
      created_by: input.created_by,
    })
    .output("inserted.assignment_id")
    .executeTakeFirst();
  if (!result) throw new Error("Assignment insert returned no identity");
  const row = await findAssignmentById(result.assignment_id);
  if (!row) throw new Error("Assignment not found after insert");
  return row;
}

/**
 * Close the assignment (sets valid_to) only if it is still current. Returns
 * false when the row was already closed — the API maps that to a 409; a
 * missing row is the caller's 404 (check with findAssignmentById first).
 */
export async function closeAssignment(
  id: number,
  validTo?: Date,
): Promise<boolean> {
  const result = await db
    .updateTable("asset_cell_assignment")
    .set({ valid_to: validTo ?? new Date() })
    .where("assignment_id", "=", id)
    .where("valid_to", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export interface ReassignInput {
  assignment_id: number;
  to_cell_id: number;
  role_label?: string | null;
  note?: string | null;
  created_by: number;
}

/**
 * Historized move: close the current row and open a new one against the target
 * cell, in one transaction (the trx inherits the `production` binding — do not
 * re-bind). Returns the new assignment, or undefined when the source row does
 * not exist or is already closed (API maps to 404/409).
 */
export async function reassign(
  input: ReassignInput,
): Promise<AssignmentRow | undefined> {
  return db.transaction().execute(async (trx) => {
    const source = await trx
      .selectFrom("asset_cell_assignment")
      .selectAll()
      .where("assignment_id", "=", input.assignment_id)
      .executeTakeFirst();
    if (!source || source.valid_to !== null) return undefined;

    const today = new Date();
    await trx
      .updateTable("asset_cell_assignment")
      .set({ valid_to: today })
      .where("assignment_id", "=", input.assignment_id)
      .where("valid_to", "is", null)
      .execute();
    const inserted = await trx
      .insertInto("asset_cell_assignment")
      .values({
        asset_id: source.asset_id,
        cell_id: input.to_cell_id,
        role_label: emptyToNull(input.role_label),
        note: emptyToNull(input.note),
        created_by: input.created_by,
      })
      .output("inserted.assignment_id")
      .executeTakeFirst();
    if (!inserted) throw new Error("Reassignment insert returned no identity");
    const row = await trx
      .selectFrom("asset_cell_assignment")
      .selectAll()
      .where("assignment_id", "=", inserted.assignment_id)
      .executeTakeFirst();
    if (!row) throw new Error("Reassignment not found after insert");
    return row;
  });
}
