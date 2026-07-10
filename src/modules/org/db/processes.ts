import "server-only";
import type { Selectable, Insertable } from "kysely";
import type { Process } from "@/lib/db/types";
import { orgDb as db, emptyToNull } from "@/lib/db/schema-clients";

// The process catalog moved from `maint` to the new `org` schema in V15: it is
// now the canonical company-wide catalog (a single "Corte láser" feeds
// equipment, plants and the process route). Administered from the admin panel.

export type ProcessRow = Selectable<Process>;

export async function listProcesses(activeOnly = false): Promise<ProcessRow[]> {
  let q = db.selectFrom("process").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  return q.orderBy("name", "asc").execute();
}

export async function findProcessById(
  id: number,
): Promise<ProcessRow | undefined> {
  const row = await db
    .selectFrom("process")
    .selectAll()
    .where("process_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreateProcessInput {
  code: string;
  name: string;
  description?: string | null;
}

export async function createProcess(
  input: CreateProcessInput,
): Promise<ProcessRow> {
  const result = await db
    .insertInto("process")
    .values({
      code: input.code.trim(),
      name: input.name.trim(),
      description: emptyToNull(input.description),
    })
    .output("inserted.process_id")
    .executeTakeFirst();
  if (!result) throw new Error("Process insert returned no identity");
  const row = await findProcessById(result.process_id);
  if (!row) throw new Error("Process not found after insert");
  return row;
}

export interface UpdateProcessInput {
  code?: string;
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export async function updateProcess(
  id: number,
  input: UpdateProcessInput,
): Promise<void> {
  const changes: Partial<Insertable<Process>> = { updated_at: new Date() };
  if (input.code !== undefined && input.code.trim()) changes.code = input.code.trim();
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.description !== undefined)
    changes.description = emptyToNull(input.description);
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db
    .updateTable("process")
    .set(changes)
    .where("process_id", "=", id)
    .execute();
}

export async function softDeleteProcess(id: number): Promise<void> {
  await db
    .updateTable("process")
    .set({ is_active: false, updated_at: new Date() })
    .where("process_id", "=", id)
    .execute();
}

/** Hard delete: blocked by FK when any asset (`maint.asset_process`) or plant
 * (`org.plant_process`) still links the process. */
export async function deleteProcess(id: number): Promise<void> {
  await db.deleteFrom("process").where("process_id", "=", id).execute();
}
