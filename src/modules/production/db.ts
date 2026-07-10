import "server-only";
import { db as rootDb } from "@/lib/db/client";
import { sql, type Selectable, type Insertable } from "kysely";
import type { AssetCellAssignment, Cell } from "@/lib/db/types";

// All tables here live in the `production` schema. Same rule as maintenance:
// kysely-codegen drops the schema from the generated keys, so bind the client
// to `production` or SQL Server looks under dbo and 208s.
const db = rootDb.withSchema("production");

// Plant/location come from `org` (V15/V18); asset code/name from `maint`.
// Typed cross-schema joins are not expressible with the flattened codegen
// keys, so lookups run as separate per-schema queries merged in JS.
const orgDb = rootDb.withSchema("org");
const maintDb = rootDb.withSchema("maint");

/** Location refs (name + owning plant) by id — since V19 a cell's plant is
 * DERIVED via its location (`cell.plant_id` was dropped), same move V18 made
 * on `maint.asset`. */
async function locationRefsById(
  ids: number[],
): Promise<
  Map<number, { code: string; name: string; plant_id: number; plant_code: string; plant_name: string }>
> {
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

async function processNamesById(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await orgDb
    .selectFrom("process")
    .select(["process_id", "name"])
    .where("process_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.process_id, r.name]));
}

interface AssetRef {
  code: string;
  name: string;
  model: string | null;
  serial_number: string | null;
  has_image: boolean;
}

async function assetRefsById(ids: number[]): Promise<Map<number, AssetRef>> {
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

export type CellRow = Selectable<Cell>;
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

// ---------------------------------------------------------------------------
// Cell errors (typed — the API layer maps these to friendly 422s)
// ---------------------------------------------------------------------------

export class CellLocationInvalidError extends Error {
  constructor() {
    super("La ubicación no existe o está inactiva.");
    this.name = "CellLocationInvalidError";
  }
}

export class CellParentInvalidError extends Error {
  constructor() {
    super(
      "La celda padre no existe, está inactiva o no está en la misma ubicación.",
    );
    this.name = "CellParentInvalidError";
  }
}

export class CellDepthExceededError extends Error {
  constructor() {
    super(
      "Una celda hija no puede tener celdas hijas a su vez (profundidad máxima: 1).",
    );
    this.name = "CellDepthExceededError";
  }
}

/** Thrown when a cell reparent targets a cell that already has children of
 * its own — it can't become a child while it is itself a parent. */
export class CellHasChildrenError extends Error {
  constructor() {
    super("Esta celda ya tiene celdas hijas: no puede pasar a ser hija de otra.");
    this.name = "CellHasChildrenError";
  }
}

export class CellCodeOverflowError extends Error {
  constructor() {
    super("Se alcanzó el máximo de celdas para esta ubicación.");
    this.name = "CellCodeOverflowError";
  }
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export interface CellListRow extends CellRow {
  location_code: string;
  location_name: string;
  plant_id: number;
  plant_code: string;
  plant_name: string;
  parent_code: string | null;
  parent_name: string | null;
  process_name: string | null;
  child_count: number;
  current_asset_count: number;
}

export async function listCells(activeOnly = false): Promise<CellListRow[]> {
  let q = db
    .selectFrom("cell")
    .leftJoin("cell as parent", "parent.cell_id", "cell.parent_cell_id")
    .selectAll("cell")
    .select(["parent.code as parent_code", "parent.name as parent_name"]);
  if (activeOnly) q = q.where("cell.is_active", "=", true);
  const cells = await q.orderBy("cell.code", "asc").execute();
  if (cells.length === 0) return [];

  const cellIds = cells.map((c) => c.cell_id);
  const [locationRefs, processNames, childCounts, assetCounts] = await Promise.all([
    locationRefsById([...new Set(cells.map((c) => c.location_id))]),
    processNamesById([
      ...new Set(cells.flatMap((c) => (c.process_id !== null ? [c.process_id] : []))),
    ]),
    db
      .selectFrom("cell")
      .select(({ fn }) => ["parent_cell_id", fn.countAll<number>().as("n")])
      .where("parent_cell_id", "is not", null)
      .where("parent_cell_id", "in", cellIds)
      .groupBy("parent_cell_id")
      .execute(),
    db
      .selectFrom("asset_cell_assignment")
      .select(({ fn }) => ["cell_id", fn.countAll<number>().as("n")])
      .where("valid_to", "is", null)
      .where("cell_id", "in", cellIds)
      .groupBy("cell_id")
      .execute(),
  ]);
  const childrenByParent = new Map(
    childCounts.map((c) => [c.parent_cell_id as number, Number(c.n)]),
  );
  const assetsByCell = new Map(assetCounts.map((c) => [c.cell_id, Number(c.n)]));

  return cells.map((c) => {
    const loc = locationRefs.get(c.location_id);
    return {
      ...c,
      parent_code: c.parent_code ?? null,
      parent_name: c.parent_name ?? null,
      location_code: loc?.code ?? "",
      location_name: loc?.name ?? "",
      plant_id: loc?.plant_id ?? 0,
      plant_code: loc?.plant_code ?? "",
      plant_name: loc?.plant_name ?? "",
      process_name:
        c.process_id !== null ? (processNames.get(c.process_id) ?? null) : null,
      child_count: childrenByParent.get(c.cell_id) ?? 0,
      current_asset_count: assetsByCell.get(c.cell_id) ?? 0,
    };
  });
}

export async function findCellById(id: number): Promise<CellRow | undefined> {
  const row = await db
    .selectFrom("cell")
    .selectAll()
    .where("cell_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

/** True if the cell has at least one child (any status) — used to enforce
 * depth 1 when assigning a parent to a cell that already has children. */
export async function cellHasChildren(cellId: number): Promise<boolean> {
  const row = await db
    .selectFrom("cell")
    .select("cell_id")
    .where("parent_cell_id", "=", cellId)
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Enforces the cell hierarchy invariant (max depth 1) for reparenting
 * `cellId` under `parentCellId`: the target parent must be active, in the
 * same location, and itself parentless; `cellId` must not already have
 * children of its own. Throws one of the `Cell*Error` classes above.
 */
export async function assertCellCanReparent(
  cellId: number,
  locationId: number,
  parentCellId: number,
): Promise<void> {
  const parent = await findCellById(parentCellId);
  if (!parent || !parent.is_active || parent.location_id !== locationId) {
    throw new CellParentInvalidError();
  }
  if (parent.parent_cell_id !== null) {
    throw new CellDepthExceededError();
  }
  if (await cellHasChildren(cellId)) {
    throw new CellHasChildrenError();
  }
}

/** Child cells of a parent, ordered by their sequence (Op10, Op20…). */
export async function listCellChildren(parentId: number): Promise<CellRow[]> {
  return db
    .selectFrom("cell")
    .selectAll()
    .where("parent_cell_id", "=", parentId)
    .orderBy("sequence_in_parent", "asc")
    .execute();
}

export interface CellDetail {
  cell: CellRow & {
    location_name: string;
    plant_name: string;
    parent_code: string | null;
    parent_name: string | null;
    process_name: string | null;
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
    .leftJoin("cell as parent", "parent.cell_id", "cell.parent_cell_id")
    .selectAll("cell")
    .select(["parent.code as parent_code", "parent.name as parent_name"])
    .where("cell.cell_id", "=", cellId)
    .executeTakeFirst();
  if (!base) return undefined;

  const [locationRefs, processNames, assignments] = await Promise.all([
    locationRefsById([base.location_id]),
    processNamesById(base.process_id !== null ? [base.process_id] : []),
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
    asset_model: assetRefs.get(a.asset_id)?.model ?? null,
    asset_serial_number: assetRefs.get(a.asset_id)?.serial_number ?? null,
    asset_has_image: assetRefs.get(a.asset_id)?.has_image ?? false,
  }));
  const loc = locationRefs.get(base.location_id);
  return {
    cell: {
      ...base,
      parent_code: base.parent_code ?? null,
      parent_name: base.parent_name ?? null,
      location_name: loc?.name ?? "",
      plant_name: loc?.plant_name ?? "",
      process_name:
        base.process_id !== null
          ? (processNames.get(base.process_id) ?? null)
          : null,
    },
    current: withAsset.filter((a) => a.valid_to === null),
    history: withAsset.filter((a) => a.valid_to !== null),
  };
}

export interface CreateCellInput {
  name: string;
  location_id: number;
  parent_cell_id?: number | null;
  size_x_m?: number | null;
  size_y_m?: number | null;
  process_id?: number | null;
}

/**
 * Create a cell with an auto-generated code `{plant.code}-{location.code}-{NN}`,
 * sequential per location (V19) — mirrors `createAsset`'s matrícula pattern.
 * One transaction: validate the parent (if any), claim the next sequence
 * value under UPDLOCK+SERIALIZABLE (race-safe), build the code, insert. If a
 * parent is given, the new cell inherits the next open sequence slot
 * (10, 20, 30…) among its siblings.
 */
export async function createCell(input: CreateCellInput): Promise<CellRow> {
  const location = await orgDb
    .selectFrom("location")
    .innerJoin("plant", "plant.plant_id", "location.plant_id")
    .select(["location.location_id", "location.code as location_code", "plant.code as plant_code"])
    .where("location.location_id", "=", input.location_id)
    .where("location.is_active", "=", true)
    .executeTakeFirst();
  if (!location) throw new CellLocationInvalidError();

  let parentId: number | null = null;
  let nextSequence: number | null = null;
  if (input.parent_cell_id != null) {
    const parent = await db
      .selectFrom("cell")
      .selectAll()
      .where("cell_id", "=", input.parent_cell_id)
      .where("is_active", "=", true)
      .executeTakeFirst();
    if (!parent || parent.location_id !== input.location_id) {
      throw new CellParentInvalidError();
    }
    if (parent.parent_cell_id !== null) throw new CellDepthExceededError();
    parentId = parent.cell_id;
    const maxSeq = await db
      .selectFrom("cell")
      .select(({ fn }) => [fn.max("sequence_in_parent").as("max_seq")])
      .where("parent_cell_id", "=", parentId)
      .executeTakeFirst();
    nextSequence = (Number(maxSeq?.max_seq) || 0) + 10;
  }

  const newId = await db.transaction().execute(async (trx) => {
    const claimed = await sql<{ seq: number }>`
      DECLARE @seq INT;
      UPDATE production.cell_code_sequence WITH (UPDLOCK, SERIALIZABLE)
        SET @seq = next_seq, next_seq = next_seq + 1
        WHERE location_id = ${location.location_id};
      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO production.cell_code_sequence (location_id, next_seq)
        VALUES (${location.location_id}, 2);
        SET @seq = 1;
      END
      SELECT @seq AS seq;
    `.execute(trx);
    const seq = claimed.rows[0]?.seq;
    if (!seq) throw new Error("Could not claim cell code sequence");
    if (seq > 99) throw new CellCodeOverflowError();
    const code = `${location.plant_code}-${location.location_code}-${String(seq).padStart(2, "0")}`;

    const result = await trx
      .insertInto("cell")
      .values({
        code,
        name: input.name.trim(),
        location_id: input.location_id,
        parent_cell_id: parentId,
        sequence_in_parent: nextSequence,
        size_x_m: input.size_x_m ?? null,
        size_y_m: input.size_y_m ?? null,
        process_id: input.process_id ?? null,
      })
      .output("inserted.cell_id")
      .executeTakeFirst();
    if (!result) throw new Error("Cell insert returned no identity");
    return result.cell_id;
  });
  const row = await findCellById(newId);
  if (!row) throw new Error("Cell not found after insert");
  return row;
}

export interface UpdateCellInput {
  name?: string;
  parent_cell_id?: number | null;
  sequence_in_parent?: number | null;
  size_x_m?: number | null;
  size_y_m?: number | null;
  process_id?: number | null;
  is_active?: boolean;
}

/** code and location_id are immutable: the code encodes the location. */
export async function updateCell(
  id: number,
  input: UpdateCellInput,
): Promise<void> {
  const changes: Partial<Insertable<Cell>> = { updated_at: new Date() };
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.parent_cell_id !== undefined) {
    changes.parent_cell_id = input.parent_cell_id;
    // Leaving a parent always clears the sequence (DB CHECK would reject it).
    if (input.parent_cell_id === null) changes.sequence_in_parent = null;
  }
  if (input.sequence_in_parent !== undefined && input.parent_cell_id !== null)
    changes.sequence_in_parent = input.sequence_in_parent;
  if (input.size_x_m !== undefined) changes.size_x_m = input.size_x_m;
  if (input.size_y_m !== undefined) changes.size_y_m = input.size_y_m;
  if (input.process_id !== undefined) changes.process_id = input.process_id;
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db.updateTable("cell").set(changes).where("cell_id", "=", id).execute();
}

/**
 * Persist a new Op10/Op20… order for one parent's children. Validates the
 * given id set matches exactly the parent's current children (any status),
 * then applies it in two phases — negative temp sequences first, final
 * `(i+1)*10` second — to dodge both `CK_cell_sequence` (rejects <= 0, so a
 * negative temp value is not an option) and the filtered unique index
 * `UQ_cell_parent_sequence` (which only applies when NOT NULL) on the way
 * through.
 */
export async function reorderCellChildren(
  parentId: number,
  orderedIds: number[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const children = await trx
      .selectFrom("cell")
      .select("cell_id")
      .where("parent_cell_id", "=", parentId)
      .execute();
    const currentIds = new Set(children.map((c) => c.cell_id));
    if (
      currentIds.size !== orderedIds.length ||
      orderedIds.some((id) => !currentIds.has(id))
    ) {
      throw new Error("El conjunto de celdas no coincide con las hijas vigentes.");
    }
    for (const cellId of orderedIds) {
      await trx
        .updateTable("cell")
        .set({ sequence_in_parent: null, updated_at: new Date() })
        .where("cell_id", "=", cellId)
        .execute();
    }
    for (const [i, cellId] of orderedIds.entries()) {
      await trx
        .updateTable("cell")
        .set({ sequence_in_parent: (i + 1) * 10, updated_at: new Date() })
        .where("cell_id", "=", cellId)
        .execute();
    }
  });
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

/**
 * Current cell names per asset, batched (machines cards view). Same-schema
 * join, so unlike the plant/asset lookups this one is a single query.
 */
export async function currentCellNamesByAssets(
  assetIds: number[],
): Promise<Map<number, string[]>> {
  if (assetIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("asset_cell_assignment")
    .innerJoin("cell", "cell.cell_id", "asset_cell_assignment.cell_id")
    .select(["asset_cell_assignment.asset_id", "cell.name"])
    .where("asset_cell_assignment.valid_to", "is", null)
    .where("asset_cell_assignment.asset_id", "in", assetIds)
    .orderBy("cell.name", "asc")
    .execute();
  const map = new Map<number, string[]>();
  for (const r of rows) {
    const arr = map.get(r.asset_id) ?? [];
    arr.push(r.name);
    map.set(r.asset_id, arr);
  }
  return map;
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

function emptyToNull(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
