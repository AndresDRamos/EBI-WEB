import "server-only";
import { db as rootDb } from "@/lib/db/client";
import type { Selectable, Insertable } from "kysely";
import type {
  AssetCellAssignment,
  Cell,
  ProductionLine,
} from "@/lib/db/types";

// All tables here live in the `produccion` schema. Same rule as maintenance:
// kysely-codegen drops the schema from the generated keys, so bind the client
// to `produccion` or SQL Server looks under dbo and 208s.
const db = rootDb.withSchema("produccion");

// Plant names come from `auth.plant`; asset code/name from `maint.asset`.
// Typed cross-schema joins are not expressible with the flattened codegen
// keys, so lookups run as separate per-schema queries merged in JS.
const authDb = rootDb.withSchema("auth");
const maintDb = rootDb.withSchema("maint");

async function plantNamesById(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await authDb
    .selectFrom("plant")
    .select(["plant_id", "name"])
    .where("plant_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.plant_id, r.name]));
}

async function assetRefsById(
  ids: number[],
): Promise<Map<number, { code: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await maintDb
    .selectFrom("asset")
    .select(["asset_id", "code", "name"])
    .where("asset_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.asset_id, { code: r.code, name: r.name }]));
}

export type LineRow = Selectable<ProductionLine>;
export type CellRow = Selectable<Cell>;
export type AssignmentRow = Selectable<AssetCellAssignment>;

/** Assignment joined with the asset's code/name (for cell composition views). */
export interface AssignmentWithAsset extends AssignmentRow {
  asset_code: string;
  asset_name: string;
}

/** Assignment joined with the cell's code/name (for the asset Ubicación tab). */
export interface AssignmentWithCell extends AssignmentRow {
  cell_code: string;
  cell_name: string;
}

// ---------------------------------------------------------------------------
// Production lines
// ---------------------------------------------------------------------------

export interface LineListRow extends LineRow {
  plant_name: string;
  cell_count: number;
}

export async function listLines(activeOnly = false): Promise<LineListRow[]> {
  let q = db.selectFrom("production_line").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  const lines = await q.orderBy("code", "asc").execute();
  if (lines.length === 0) return [];

  const [plantNames, counts] = await Promise.all([
    plantNamesById([...new Set(lines.map((l) => l.plant_id))]),
    db
      .selectFrom("cell")
      .select(({ fn }) => ["line_id", fn.countAll<number>().as("n")])
      .where(
        "line_id",
        "in",
        lines.map((l) => l.line_id),
      )
      .groupBy("line_id")
      .execute(),
  ]);
  const cellsByLine = new Map(counts.map((c) => [c.line_id, Number(c.n)]));
  return lines.map((l) => ({
    ...l,
    plant_name: plantNames.get(l.plant_id) ?? "",
    cell_count: cellsByLine.get(l.line_id) ?? 0,
  }));
}

export async function findLineById(id: number): Promise<LineRow | undefined> {
  const row = await db
    .selectFrom("production_line")
    .selectAll()
    .where("line_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreateLineInput {
  code: string;
  name: string;
  plant_id: number;
}

export async function createLine(input: CreateLineInput): Promise<LineRow> {
  const result = await db
    .insertInto("production_line")
    .values({
      code: input.code.trim(),
      name: input.name.trim(),
      plant_id: input.plant_id,
    })
    .output("inserted.line_id")
    .executeTakeFirst();
  if (!result) throw new Error("Line insert returned no identity");
  const row = await findLineById(result.line_id);
  if (!row) throw new Error("Line not found after insert");
  return row;
}

export interface UpdateLineInput {
  code?: string;
  name?: string;
  plant_id?: number;
  is_active?: boolean;
}

export async function updateLine(
  id: number,
  input: UpdateLineInput,
): Promise<void> {
  const changes: Partial<Insertable<ProductionLine>> = { updated_at: new Date() };
  if (input.code !== undefined && input.code.trim()) changes.code = input.code.trim();
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.plant_id !== undefined) changes.plant_id = input.plant_id;
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db
    .updateTable("production_line")
    .set(changes)
    .where("line_id", "=", id)
    .execute();
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export interface CellListRow extends CellRow {
  plant_name: string;
  line_code: string | null;
  line_name: string | null;
  current_asset_count: number;
}

export async function listCells(activeOnly = false): Promise<CellListRow[]> {
  let q = db
    .selectFrom("cell")
    .leftJoin("production_line", "production_line.line_id", "cell.line_id")
    .selectAll("cell")
    .select([
      "production_line.code as line_code",
      "production_line.name as line_name",
    ]);
  if (activeOnly) q = q.where("cell.is_active", "=", true);
  const cells = await q.orderBy("cell.code", "asc").execute();
  if (cells.length === 0) return [];

  const [plantNames, counts] = await Promise.all([
    plantNamesById([...new Set(cells.map((c) => c.plant_id))]),
    db
      .selectFrom("asset_cell_assignment")
      .select(({ fn }) => ["cell_id", fn.countAll<number>().as("n")])
      .where("valid_to", "is", null)
      .where(
        "cell_id",
        "in",
        cells.map((c) => c.cell_id),
      )
      .groupBy("cell_id")
      .execute(),
  ]);
  const assetsByCell = new Map(counts.map((c) => [c.cell_id, Number(c.n)]));
  return cells.map((c) => ({
    ...c,
    line_code: c.line_code ?? null,
    line_name: c.line_name ?? null,
    plant_name: plantNames.get(c.plant_id) ?? "",
    current_asset_count: assetsByCell.get(c.cell_id) ?? 0,
  }));
}

export async function findCellById(id: number): Promise<CellRow | undefined> {
  const row = await db
    .selectFrom("cell")
    .selectAll()
    .where("cell_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CellDetail {
  cell: CellRow & {
    plant_name: string;
    line_code: string | null;
    line_name: string | null;
  };
  current: AssignmentWithAsset[];
  history: AssignmentWithAsset[];
}

/** Full detail for the cell page: cell + current composition + closed history. */
export async function getCellDetail(
  cellId: number,
): Promise<CellDetail | undefined> {
  const base = await db
    .selectFrom("cell")
    .leftJoin("production_line", "production_line.line_id", "cell.line_id")
    .selectAll("cell")
    .select([
      "production_line.code as line_code",
      "production_line.name as line_name",
    ])
    .where("cell.cell_id", "=", cellId)
    .executeTakeFirst();
  if (!base) return undefined;

  const [plantNames, assignments] = await Promise.all([
    plantNamesById([base.plant_id]),
    db
      .selectFrom("asset_cell_assignment")
      .selectAll()
      .where("cell_id", "=", cellId)
      .orderBy("valid_from", "desc")
      .orderBy("assignment_id", "desc")
      .execute(),
  ]);
  const assetRefs = await assetRefsById([
    ...new Set(assignments.map((a) => a.asset_id)),
  ]);
  const withAsset: AssignmentWithAsset[] = assignments.map((a) => ({
    ...a,
    asset_code: assetRefs.get(a.asset_id)?.code ?? "",
    asset_name: assetRefs.get(a.asset_id)?.name ?? "",
  }));
  return {
    cell: {
      ...base,
      plant_name: plantNames.get(base.plant_id) ?? "",
      line_code: base.line_code ?? null,
      line_name: base.line_name ?? null,
    },
    current: withAsset.filter((a) => a.valid_to === null),
    history: withAsset.filter((a) => a.valid_to !== null),
  };
}

export interface CreateCellInput {
  code: string;
  name: string;
  plant_id: number;
  line_id?: number | null;
  sequence_in_line?: number | null;
}

export async function createCell(input: CreateCellInput): Promise<CellRow> {
  const result = await db
    .insertInto("cell")
    .values({
      code: input.code.trim(),
      name: input.name.trim(),
      plant_id: input.plant_id,
      line_id: input.line_id ?? null,
      // DB CHECK CK_cell_sequence_requires_line rejects a sequence without a
      // line; normalize here so the API layer's friendly 422 is the only gate.
      sequence_in_line: input.line_id != null ? (input.sequence_in_line ?? null) : null,
    })
    .output("inserted.cell_id")
    .executeTakeFirst();
  if (!result) throw new Error("Cell insert returned no identity");
  const row = await findCellById(result.cell_id);
  if (!row) throw new Error("Cell not found after insert");
  return row;
}

export interface UpdateCellInput {
  code?: string;
  name?: string;
  plant_id?: number;
  line_id?: number | null;
  sequence_in_line?: number | null;
  is_active?: boolean;
}

export async function updateCell(
  id: number,
  input: UpdateCellInput,
): Promise<void> {
  const changes: Partial<Insertable<Cell>> = { updated_at: new Date() };
  if (input.code !== undefined && input.code.trim()) changes.code = input.code.trim();
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.plant_id !== undefined) changes.plant_id = input.plant_id;
  if (input.line_id !== undefined) {
    changes.line_id = input.line_id;
    // Leaving a line always clears the sequence (DB CHECK would reject it).
    if (input.line_id === null) changes.sequence_in_line = null;
  }
  if (input.sequence_in_line !== undefined && input.line_id !== null)
    changes.sequence_in_line = input.sequence_in_line;
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db.updateTable("cell").set(changes).where("cell_id", "=", id).execute();
}

// ---------------------------------------------------------------------------
// Asset ↔ cell assignments (temporal). Rows are immutable except closing
// valid_to: a reassignment is close + insert, never an in-place UPDATE of
// asset_id/cell_id. The filtered unique index UQ_asset_cell_assignment_current
// blocks a duplicate CURRENT row per (asset, cell) pair.
// ---------------------------------------------------------------------------

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

/** Current assignments of one asset (an asset may serve several cells). */
export async function listCurrentByAsset(
  assetId: number,
): Promise<AssignmentWithCell[]> {
  return withCellRefs(
    await db
      .selectFrom("asset_cell_assignment")
      .selectAll()
      .where("asset_id", "=", assetId)
      .where("valid_to", "is", null)
      .orderBy("valid_from", "desc")
      .execute(),
  );
}

/** Full assignment history of one asset (closed rows included), newest first. */
export async function listHistoryByAsset(
  assetId: number,
): Promise<AssignmentWithCell[]> {
  return withCellRefs(
    await db
      .selectFrom("asset_cell_assignment")
      .selectAll()
      .where("asset_id", "=", assetId)
      .orderBy("valid_from", "desc")
      .orderBy("assignment_id", "desc")
      .execute(),
  );
}

async function withCellRefs(
  rows: AssignmentRow[],
): Promise<AssignmentWithCell[]> {
  if (rows.length === 0) return [];
  const cells = await db
    .selectFrom("cell")
    .select(["cell_id", "code", "name"])
    .where(
      "cell_id",
      "in",
      [...new Set(rows.map((r) => r.cell_id))],
    )
    .execute();
  const byId = new Map(cells.map((c) => [c.cell_id, c]));
  return rows.map((r) => ({
    ...r,
    cell_code: byId.get(r.cell_id)?.code ?? "",
    cell_name: byId.get(r.cell_id)?.name ?? "",
  }));
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
 * cell, in one transaction (the trx inherits the `produccion` binding — do not
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

// Enum domains live in src/modules/production/enums.ts (pure module, shared
// with the client UI). Re-exported here so API routes keep one import site.
export { ASSET_CATEGORIES } from "@/modules/production/enums";

function emptyToNull(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
