import "server-only";
import { type Selectable } from "kysely";
import type { MachineProgram } from "@/lib/db/types";
import { db, stagingDb, SCOPE, SETUP_MINUTES } from "./shared";

/**
 * Sequence-program CRUD for one laser cell on one date. Portal-owned
 * (`planning` schema, CRUD). Entries reference `staging.eps_nesting` logically
 * (no FK by design — staging must stay re-baselinable), so existence is
 * validated HERE at insert.
 */

export type MachineProgramRow = Selectable<MachineProgram>;

// ---------------------------------------------------------------------------
// Typed errors (API maps these to friendly 4xx)
// ---------------------------------------------------------------------------
export class ProgramNotFoundError extends Error {
  constructor() {
    super("El programa no existe.");
    this.name = "ProgramNotFoundError";
  }
}
export class ProgramNotDraftError extends Error {
  constructor() {
    super("Solo se pueden editar programas en borrador.");
    this.name = "ProgramNotDraftError";
  }
}
export class NestingNotOpenError extends Error {
  constructor() {
    super("El nesteo no existe o ya no está en la ventana abierta.");
    this.name = "NestingNotOpenError";
  }
}
export class EntryExistsError extends Error {
  constructor() {
    super("El nesteo ya está en este programa.");
    this.name = "EntryExistsError";
  }
}
export class EntrySetMismatchError extends Error {
  constructor() {
    super("El orden recibido no coincide con los nesteos del programa.");
    this.name = "EntrySetMismatchError";
  }
}

// ---------------------------------------------------------------------------
// Pure reorder helper (unit-tested): because CK_machine_program_entry_sequence
// forbids sequence_no <= 0, the two-pass reorder uses a POSITIVE temp offset
// (never negative temps) to dodge UNIQUE(program, sequence_no) mid-update.
// ---------------------------------------------------------------------------
export function reorderPasses(orderedNestingIds: number[], offset = 1_000_000) {
  return {
    temp: orderedNestingIds.map((id, i) => ({ id, seq: offset + i })),
    final: orderedNestingIds.map((id, i) => ({ id, seq: (i + 1) * 10 })),
  };
}

// Shift NULL handling: v1 works per whole day (shift = null). SQL Server unique
// index treats NULLs as equal, so "one published per cell/date/whole-day".

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export interface ProgramEntryRow {
  eps_nesting_id: number;
  sequence_no: number;
  program_name: string | null;
  cut_minutes: number | null;
  plate_count: number | null;
  eps_sequence_no: number | null;
}

export interface CellProgram {
  machine_program_id: number;
  cell_id: number;
  program_date: string;
  shift: number | null;
  status: string;
  notes: string | null;
  entries: ProgramEntryRow[];
  total_minutes: number;
}

function totalMinutes(entries: ProgramEntryRow[]): number {
  const cut = entries.reduce((sum, e) => sum + (e.cut_minutes ?? 0), 0);
  return cut + SETUP_MINUTES * entries.length;
}

/** Enrich raw entries (program_id, nesting_id, seq) with nesting facts from
 * staging + EPS's own suggested sequence, ordered by our sequence_no. */
async function enrichEntries(
  raw: { eps_nesting_id: number; sequence_no: number }[],
): Promise<ProgramEntryRow[]> {
  if (raw.length === 0) return [];
  const ids = raw.map((e) => e.eps_nesting_id);
  const [nestings, plans] = await Promise.all([
    stagingDb
      .selectFrom("eps_nesting")
      .select(["eps_nesting_id", "program_name", "cut_minutes", "plate_count"])
      .where("eps_nesting_id", "in", ids)
      .execute(),
    stagingDb
      .selectFrom("eps_nesting_plan")
      .select(["eps_nesting_id", "sequence_no"])
      .where("eps_nesting_id", "in", ids)
      .execute(),
  ]);
  const nestingById = new Map(nestings.map((n) => [n.eps_nesting_id, n]));
  const epsSeqById = new Map(plans.map((p) => [p.eps_nesting_id, p.sequence_no]));
  return raw
    .slice()
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .map((e) => {
      const n = nestingById.get(e.eps_nesting_id);
      return {
        eps_nesting_id: e.eps_nesting_id,
        sequence_no: e.sequence_no,
        program_name: n?.program_name ?? null,
        cut_minutes: n?.cut_minutes === null || n?.cut_minutes === undefined ? null : Number(n.cut_minutes),
        plate_count: n?.plate_count ?? null,
        eps_sequence_no: epsSeqById.get(e.eps_nesting_id) ?? null,
      };
    });
}

async function loadEntries(programId: number): Promise<ProgramEntryRow[]> {
  const raw = await db
    .selectFrom("machine_program_entry")
    .select(["eps_nesting_id", "sequence_no"])
    .where("machine_program_id", "=", programId)
    .execute();
  return enrichEntries(raw);
}

function toCellProgram(p: MachineProgramRow, entries: ProgramEntryRow[]): CellProgram {
  return {
    machine_program_id: p.machine_program_id,
    cell_id: p.cell_id,
    program_date: typeof p.program_date === "string" ? p.program_date : toDateStr(p.program_date),
    shift: p.shift,
    status: p.status,
    notes: p.notes,
    entries,
    total_minutes: totalMinutes(entries),
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Full detail for one program (right-panel view). */
export async function getProgramDetail(programId: number): Promise<CellProgram | undefined> {
  const p = await db
    .selectFrom("machine_program")
    .selectAll()
    .where("machine_program_id", "=", programId)
    .executeTakeFirst();
  if (!p) return undefined;
  return toCellProgram(p, await loadEntries(programId));
}

/**
 * Timeline data for a date: one chosen program per cell — the draft if one
 * exists, otherwise the published one (archived programs never surface). Only
 * cells that have a program on that date appear.
 */
export async function getDatePrograms(date: Date): Promise<CellProgram[]> {
  const programs = await db
    .selectFrom("machine_program")
    .selectAll()
    .where("program_date", "=", date)
    .where("status", "in", ["draft", "published"])
    .execute();
  if (programs.length === 0) return [];

  // Prefer draft, then the highest id, as the cell's working program.
  const chosen = new Map<number, MachineProgramRow>();
  for (const p of programs) {
    const cur = chosen.get(p.cell_id);
    if (!cur) chosen.set(p.cell_id, p);
    else if (cur.status !== "draft" && p.status === "draft") chosen.set(p.cell_id, p);
    else if (cur.status === p.status && p.machine_program_id > cur.machine_program_id)
      chosen.set(p.cell_id, p);
  }
  const result: CellProgram[] = [];
  for (const p of chosen.values()) {
    result.push(toCellProgram(p, await loadEntries(p.machine_program_id)));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
async function requireDraft(programId: number): Promise<MachineProgramRow> {
  const p = await db
    .selectFrom("machine_program")
    .selectAll()
    .where("machine_program_id", "=", programId)
    .executeTakeFirst();
  if (!p) throw new ProgramNotFoundError();
  if (p.status !== "draft") throw new ProgramNotDraftError();
  return p;
}

/** Existing draft for cell/date/shift, or a freshly-created one. Idempotent
 * entry point for "drop a nesting onto a cell row". */
export async function ensureDraftProgram(
  cellId: number,
  date: Date,
  shift: number | null,
  userId: number,
): Promise<number> {
  let draftQuery = db
    .selectFrom("machine_program")
    .select("machine_program_id")
    .where("cell_id", "=", cellId)
    .where("program_date", "=", date)
    .where("status", "=", "draft");
  draftQuery =
    shift === null
      ? draftQuery.where("shift", "is", null)
      : draftQuery.where("shift", "=", shift);
  const existing = await draftQuery.executeTakeFirst();
  if (existing) return existing.machine_program_id;

  const inserted = await db
    .insertInto("machine_program")
    .values({ cell_id: cellId, program_date: date, shift, status: "draft", created_by: userId })
    .output("inserted.machine_program_id")
    .executeTakeFirst();
  if (!inserted) throw new Error("Program insert returned no identity");
  return inserted.machine_program_id;
}

/** Append a nesting to a draft. Validates it exists in the open window and is
 * not already present. Returns the assigned sequence_no. */
export async function addEntry(programId: number, nestingId: number): Promise<number> {
  await requireDraft(programId);

  const nesting = await stagingDb
    .selectFrom("eps_nesting")
    .select("eps_nesting_id")
    .where("eps_nesting_id", "=", nestingId)
    .where("finished_at", "is", null)
    .where("is_deleted", "=", false)
    .where("eps_plant_id", "=", SCOPE.plantId)
    .where("eps_route_id", "=", SCOPE.routeId)
    .executeTakeFirst();
  if (!nesting) throw new NestingNotOpenError();

  const dup = await db
    .selectFrom("machine_program_entry")
    .select("eps_nesting_id")
    .where("machine_program_id", "=", programId)
    .where("eps_nesting_id", "=", nestingId)
    .executeTakeFirst();
  if (dup) throw new EntryExistsError();

  const max = await db
    .selectFrom("machine_program_entry")
    .select(({ fn }) => fn.max("sequence_no").as("max_seq"))
    .where("machine_program_id", "=", programId)
    .executeTakeFirst();
  const seq = (Number(max?.max_seq) || 0) + 10;

  await db
    .insertInto("machine_program_entry")
    .values({ machine_program_id: programId, eps_nesting_id: nestingId, sequence_no: seq })
    .execute();
  await touch(programId);
  return seq;
}

/** Remove a nesting from a draft. No-op resequencing (gaps are harmless). */
export async function removeEntry(programId: number, nestingId: number): Promise<void> {
  await requireDraft(programId);
  await db
    .deleteFrom("machine_program_entry")
    .where("machine_program_id", "=", programId)
    .where("eps_nesting_id", "=", nestingId)
    .execute();
  await touch(programId);
}

/** Persist a new order for a draft's entries (positive-offset two-pass). The
 * given id set must match the program's current entries exactly. */
export async function reorderEntries(programId: number, orderedNestingIds: number[]): Promise<void> {
  await requireDraft(programId);
  await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom("machine_program_entry")
      .select("eps_nesting_id")
      .where("machine_program_id", "=", programId)
      .execute();
    const currentIds = new Set(current.map((e) => e.eps_nesting_id));
    if (
      currentIds.size !== orderedNestingIds.length ||
      orderedNestingIds.some((id) => !currentIds.has(id))
    ) {
      throw new EntrySetMismatchError();
    }
    const { temp, final } = reorderPasses(orderedNestingIds);
    for (const { id, seq } of temp) {
      await trx
        .updateTable("machine_program_entry")
        .set({ sequence_no: seq })
        .where("machine_program_id", "=", programId)
        .where("eps_nesting_id", "=", id)
        .execute();
    }
    for (const { id, seq } of final) {
      await trx
        .updateTable("machine_program_entry")
        .set({ sequence_no: seq })
        .where("machine_program_id", "=", programId)
        .where("eps_nesting_id", "=", id)
        .execute();
    }
  });
  await touch(programId);
}

export interface UpdateProgramInput {
  notes?: string | null;
}

/** Patch a program's editable fields (notes). Status changes go through the
 * dedicated publish transition. */
export async function updateProgram(programId: number, input: UpdateProgramInput): Promise<void> {
  const p = await db
    .selectFrom("machine_program")
    .select("machine_program_id")
    .where("machine_program_id", "=", programId)
    .executeTakeFirst();
  if (!p) throw new ProgramNotFoundError();
  await db
    .updateTable("machine_program")
    .set({ notes: input.notes ?? null, updated_at: new Date() })
    .where("machine_program_id", "=", programId)
    .execute();
}

/**
 * Publish a draft: archive the previously published program for the same
 * cell/date/shift (keeps history, honors the one-published filtered unique),
 * then flip this draft to published. One transaction.
 */
export async function publishProgram(programId: number): Promise<void> {
  const draft = await requireDraft(programId);
  await db.transaction().execute(async (trx) => {
    const prevQuery = trx
      .updateTable("machine_program")
      .set({ status: "archived", updated_at: new Date() })
      .where("cell_id", "=", draft.cell_id)
      .where("program_date", "=", draft.program_date)
      .where("status", "=", "published");
    await (draft.shift === null
      ? prevQuery.where("shift", "is", null)
      : prevQuery.where("shift", "=", draft.shift)
    ).execute();

    await trx
      .updateTable("machine_program")
      .set({ status: "published", updated_at: new Date() })
      .where("machine_program_id", "=", programId)
      .execute();
  });
}

/** Delete a draft program (entries cascade). Only drafts are deletable. */
export async function deleteProgram(programId: number): Promise<void> {
  await requireDraft(programId);
  await db.deleteFrom("machine_program").where("machine_program_id", "=", programId).execute();
}

async function touch(programId: number): Promise<void> {
  await db
    .updateTable("machine_program")
    .set({ updated_at: new Date() })
    .where("machine_program_id", "=", programId)
    .execute();
}
