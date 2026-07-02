import "server-only";
import { db } from "./client";
import type { DB } from "./types";

/**
 * Typed access to the report catalog (`dbo.report`, `dbo.report_category`).
 * All untyped/raw SQL lives inside this directory; callers go through these
 * functions. Return types use Kysely's `Selectable` so `Generated<T>` identity
 * columns resolve to plain `T` on read.
 */
import type { Insertable, Selectable } from "kysely";

export type ReportRow = Selectable<DB["report"]>;
export type CategoryRow = Selectable<DB["report_category"]>;

export type ReportInput = Omit<
  Insertable<DB["report"]>,
  "report_id" | "created_at" | "updated_at"
> & { created_at?: Date; updated_at?: Date };

export interface ReportWithCategory {
  report_id: number;
  name: string;
  workspace_guid: string;
  report_guid: string;
  dataset_guid: string | null;
  category_id: number | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  category_name: string | null;
  category_sort_order: number | null;
}

export interface AdminReportViewItem {
  report_id: number;
  name: string;
  workspace_guid: string;
  report_guid: string;
  dataset_guid: string | null;
  category_id: number | null;
  category_name: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: Date;
}

export function listCategories(): Promise<CategoryRow[]> {
  return db
    .selectFrom("report_category")
    .select(["category_id", "name", "sort_order"])
    .orderBy("sort_order", "asc")
    .orderBy("name", "asc")
    .execute();
}

export async function listActiveReports(): Promise<ReportWithCategory[]> {
  const rows = await db
    .selectFrom("report")
    .innerJoin(
      "report_category",
      "report_category.category_id",
      "report.category_id",
    )
    .select([
      "report.report_id",
      "report.name",
      "report.workspace_guid",
      "report.report_guid",
      "report.dataset_guid",
      "report.category_id",
      "report.description",
      "report.sort_order",
      "report.is_active",
      "report.created_at",
      "report.updated_at",
      "report_category.name as category_name",
      "report_category.sort_order as category_sort_order",
    ])
    .where("report.is_active", "=", true)
    .orderBy("report_category.sort_order", "asc")
    .orderBy("report.sort_order", "asc")
    .orderBy("report.name", "asc")
    .execute();
  return rows as ReportWithCategory[];
}

export async function getReport(
  id: number,
): Promise<ReportWithCategory | undefined> {
  const row = await db
    .selectFrom("report")
    .leftJoin(
      "report_category",
      "report_category.category_id",
      "report.category_id",
    )
    .select([
      "report.report_id",
      "report.name",
      "report.workspace_guid",
      "report.report_guid",
      "report.dataset_guid",
      "report.category_id",
      "report.description",
      "report.sort_order",
      "report.is_active",
      "report.created_at",
      "report.updated_at",
      "report_category.name as category_name",
      "report_category.sort_order as category_sort_order",
    ])
    .where("report.report_id", "=", id)
    .executeTakeFirst();
  return (row as ReportWithCategory | undefined) ?? undefined;
}

export async function adminListReports(): Promise<AdminReportViewItem[]> {
  const rows = await db
    .selectFrom("report")
    .leftJoin(
      "report_category",
      "report_category.category_id",
      "report.category_id",
    )
    .select([
      "report.report_id",
      "report.name",
      "report.workspace_guid",
      "report.report_guid",
      "report.dataset_guid",
      "report.category_id",
      "report_category.name as category_name",
      "report.description",
      "report.sort_order",
      "report.is_active",
      "report.updated_at",
    ])
    .orderBy("report_category.sort_order", "asc")
    .orderBy("report.sort_order", "asc")
    .orderBy("report.name", "asc")
    .execute();
  return rows as AdminReportViewItem[];
}

export async function createReport(input: ReportInput): Promise<ReportRow> {
  const result = await db
    .insertInto("report")
    .values({
      name: input.name,
      workspace_guid: input.workspace_guid,
      report_guid: input.report_guid,
      dataset_guid: input.dataset_guid,
      category_id: input.category_id,
      description: input.description,
      sort_order: input.sort_order,
      is_active: Boolean(input.is_active),
    })
    .output("inserted.report_id")
    .executeTakeFirst();
  if (!result) {
    throw new Error("Report insert returned no identity");
  }
  const created = await db
    .selectFrom("report")
    .selectAll()
    .where("report_id", "=", result.report_id)
    .executeTakeFirst();
  if (!created) {
    throw new Error("Report not found after insert");
  }
  return created;
}

export async function updateReport(
  id: number,
  input: Partial<ReportInput>,
): Promise<void> {
  const changes: Partial<Insertable<DB["report"]>> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.workspace_guid !== undefined)
    changes.workspace_guid = input.workspace_guid;
  if (input.report_guid !== undefined) changes.report_guid = input.report_guid;
  if (input.dataset_guid !== undefined) changes.dataset_guid = input.dataset_guid;
  if (input.category_id !== undefined) changes.category_id = input.category_id;
  if (input.description !== undefined) changes.description = input.description;
  if (input.sort_order !== undefined) changes.sort_order = input.sort_order;
  if (input.is_active !== undefined) changes.is_active = Boolean(input.is_active);
  if (Object.keys(changes).length === 0) {
    return;
  }
  changes.updated_at = new Date();
  await db
    .updateTable("report")
    .set(changes)
    .where("report_id", "=", id)
    .execute();
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await db
    .updateTable("report")
    .set({ is_active: active, updated_at: new Date() })
    .where("report_id", "=", id)
    .execute();
}

export async function deleteReport(id: number): Promise<void> {
  await db.deleteFrom("report").where("report_id", "=", id).execute();
}

export async function createCategory(
  name: string,
  sortOrder = 0,
): Promise<CategoryRow> {
  const result = await db
    .insertInto("report_category")
    .values({ name, sort_order: sortOrder })
    .output("inserted.category_id")
    .executeTakeFirst();
  if (!result) {
    throw new Error("Category insert returned no identity");
  }
  const category = await db
    .selectFrom("report_category")
    .select(["category_id", "name", "sort_order"])
    .where("category_id", "=", result.category_id)
    .executeTakeFirst();
  if (!category) {
    throw new Error("Category not found after insert");
  }
  return category;
}

export async function updateCategory(
  id: number,
  input: { name?: string; sort_order?: number },
): Promise<void> {
  const changes: Partial<Insertable<DB["report_category"]>> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.sort_order !== undefined) changes.sort_order = input.sort_order;
  if (Object.keys(changes).length === 0) {
    return;
  }
  await db
    .updateTable("report_category")
    .set(changes)
    .where("category_id", "=", id)
    .execute();
}

export async function deleteCategory(id: number): Promise<void> {
  await db
    .deleteFrom("report_category")
    .where("category_id", "=", id)
    .execute();
}