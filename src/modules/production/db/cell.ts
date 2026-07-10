import "server-only";
import { sql, type Selectable, type Insertable } from "kysely";
import type { Cell } from "@/lib/db/types";
import { db, orgDb } from "./shared";
import { locationRefsById, processNamesById } from "@/lib/db/refs";
import { listAssignmentsForCell, type AssignmentWithAsset } from "./assignment";

export type CellRow = Selectable<Cell>;

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

/** UI-facing projection of `CellListRow` (the operative-cells page and its
 * client components never see the DB row directly — this is the one
 * serialization boundary, so a new DB field can't leak into the client
 * silently). */
export type OperativeCellRow = Pick<
  CellListRow,
  | "cell_id"
  | "code"
  | "name"
  | "location_id"
  | "location_name"
  | "plant_id"
  | "plant_name"
  | "parent_cell_id"
  | "sequence_in_parent"
  | "size_x_m"
  | "size_y_m"
  | "process_id"
  | "process_name"
  | "child_count"
  | "current_asset_count"
  | "is_active"
>;

export function toOperativeCellRow(row: CellListRow): OperativeCellRow {
  return {
    cell_id: row.cell_id,
    code: row.code,
    name: row.name,
    location_id: row.location_id,
    location_name: row.location_name,
    plant_id: row.plant_id,
    plant_name: row.plant_name,
    parent_cell_id: row.parent_cell_id,
    sequence_in_parent: row.sequence_in_parent,
    size_x_m: row.size_x_m,
    size_y_m: row.size_y_m,
    process_id: row.process_id,
    process_name: row.process_name,
    child_count: row.child_count,
    current_asset_count: row.current_asset_count,
    is_active: row.is_active,
  };
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

  const [locationRefs, processNames, { current, history }] = await Promise.all([
    locationRefsById([base.location_id]),
    processNamesById(base.process_id !== null ? [base.process_id] : []),
    listAssignmentsForCell(cellId),
  ]);
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
    current,
    history,
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
