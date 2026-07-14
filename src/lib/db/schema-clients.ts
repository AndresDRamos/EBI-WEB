import "server-only";
import { db as rootDb } from "./client";

/**
 * Single home for per-schema Kysely clients. kysely-codegen drops the schema
 * from the generated keys, so every query needs a client bound to its schema
 * or SQL Server resolves bare table names under `dbo` and fails with 208.
 * Every module binds from here instead of calling `withSchema` itself.
 */
export const authDb = rootDb.withSchema("auth");
export const orgDb = rootDb.withSchema("org");
export const maintDb = rootDb.withSchema("maint");
export const productionDb = rootDb.withSchema("production");
export const planningDb = rootDb.withSchema("planning");
// Read-only for the portal: `staging` is landed exclusively by the on-prem ETL
// (never written here) and `etl.run_log` is the freshness indicator.
export const stagingDb = rootDb.withSchema("staging");
export const etlDb = rootDb.withSchema("etl");

export function emptyToNull(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
