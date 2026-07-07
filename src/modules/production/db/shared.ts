import "server-only";
import { db as rootDb } from "@/lib/db/client";

/**
 * Shared plumbing for the plant-layout data layer. Same rules as
 * `../db.ts` (which stays untouched — maintenance consumes its exports):
 * bind the client to the `production` schema, and resolve cross-schema
 * display names with separate per-schema queries merged in JS.
 */

export const db = rootDb.withSchema("production");
// Plant moved from `auth` to the new `org` schema in V15.
export const orgDb = rootDb.withSchema("org");
export const maintDb = rootDb.withSchema("maint");

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

export async function assetRefsById(
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

export function emptyToNull(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
