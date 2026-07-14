import "server-only";
import { planningDb, stagingDb, etlDb, orgDb } from "@/lib/db/schema-clients";

/**
 * Shared plumbing for the planning data layer (laser-cut sequencing). The
 * portal OWNS `planning` (CRUD) and only READS `staging` (ETL-landed replica)
 * and `etl.run_log` (freshness). Per-schema clients live in `src/lib/db/`
 * (domain-blind infra); this file re-binds them under the module's names.
 */

export const db = planningDb;
export { stagingDb, etlDb, orgDb };

/**
 * v1 scope constant: Plant 1, EPS route 9 (Corte Láser) ↔ portal process `CL`.
 * The whole module is written parameterized by (plant, route) but ships with
 * this single scope; the EPS-route ↔ process mapping table is deferred until a
 * second process onboards (see the plan's "Future work").
 */
export const SCOPE = Object.freeze({ plantId: 1, routeId: 9, processCode: "CL" });

/** Fixed setup added per nesting when computing loaded machine time (v1 does
 * NOT model finite capacity — this is a flat allowance, not a calendar). */
export const SETUP_MINUTES = 15;

/** Resolve the portal process id for the module's process code (`CL`). */
export async function laserProcessId(): Promise<number | null> {
  const row = await orgDb
    .selectFrom("process")
    .select("process_id")
    .where("code", "=", SCOPE.processCode)
    .executeTakeFirst();
  return row?.process_id ?? null;
}
