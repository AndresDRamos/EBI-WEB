/**
 * Kysely database types for EBI.
 *
 * Mirrors `dbo.report` and `dbo.report_category` from `V1__init.sql`. Regenerate
 * with `pnpm db:gen` (kysely-codegen) against a reachable `EBI_dev`/`EBI` when the
 * schema changes. The MCP introspection user is read-only (`ebi_agent_ro`);
 * runtime CRUD connects as `ebi_app`.
 */

import type { Generated } from "kysely";

export interface ReportCategory {
  category_id: Generated<number>;
  name: string;
  sort_order: number;
}

export interface Report {
  report_id: Generated<number>;
  name: string;
  workspace_guid: string;
  report_guid: string;
  dataset_guid: string | null;
  category_id: number | null;
  description: string | null;
  sort_order: number;
  is_active: number; // BIT maps to number in Kysely (tedious)
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DB {
  report: Report;
  report_category: ReportCategory;
}