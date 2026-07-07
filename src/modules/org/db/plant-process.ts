import "server-only";
import { db as rootDb } from "@/lib/db/client";
import type { Selectable } from "kysely";
import type { PlantProcess } from "@/lib/db/types";

// `org.plant_process` (V15): N:M bridge "which plant runs which process". A
// process_id repeats freely across plants (a single "Corte láser" assigned to
// plants 1, 2, 6). Link-row only — unassign = delete the row. Bind to `org`.
const db = rootDb.withSchema("org");

export type PlantProcessRow = Selectable<PlantProcess>;

/** All plant↔process links (small catalog; grouped in the UI by plant). */
export async function listPlantProcessLinks(): Promise<PlantProcessRow[]> {
  return db.selectFrom("plant_process").selectAll().execute();
}

/** Processes assigned to one plant (ids only). */
export async function listProcessIdsByPlant(plantId: number): Promise<number[]> {
  const rows = await db
    .selectFrom("plant_process")
    .select("process_id")
    .where("plant_id", "=", plantId)
    .execute();
  return rows.map((r) => r.process_id);
}

/**
 * Replace the set of processes assigned to a plant in one transaction. The trx
 * inherits the `org` schema binding — do not re-bind inside. Same shape as
 * `maintenance.setAssetProcesses`.
 */
export async function setPlantProcesses(
  plantId: number,
  processIds: number[],
): Promise<void> {
  const unique = [...new Set(processIds)];
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("plant_process")
      .where("plant_id", "=", plantId)
      .execute();
    if (unique.length > 0) {
      await trx
        .insertInto("plant_process")
        .values(unique.map((pid) => ({ plant_id: plantId, process_id: pid })))
        .execute();
    }
  });
}
