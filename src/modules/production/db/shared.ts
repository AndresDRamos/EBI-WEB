import "server-only";
import { productionDb, orgDb, maintDb, emptyToNull } from "@/lib/db/schema-clients";
import { assetRefsById } from "@/lib/db/refs";

/**
 * Shared plumbing for the production data layer (plant layout, cells,
 * assignments). Per-schema clients and cross-schema ref lookups live in
 * `src/lib/db/` (domain-blind infra, shared with `maintenance`) — this file
 * just re-binds them under the names the module's queries already use.
 */

export const db = productionDb;
export { orgDb, maintDb, emptyToNull, assetRefsById };

export async function plantNamesById(
  ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await orgDb
    .selectFrom("plant")
    .select(["plant_id", "name"])
    .where("plant_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.plant_id, r.name]));
}
