import "server-only";
import { db as rootDb } from "@/lib/db/client";
import type { Selectable, Insertable } from "kysely";
import type {
  Asset,
  AssetDocument,
  AssetRestriction,
  Process,
} from "@/lib/db/types";

// All tables here live in the `maint` schema. Same rule as org.ts/users.ts:
// kysely-codegen drops the schema from the generated keys, so bind the client
// to `maint` or SQL Server looks under dbo and 208s.
const db = rootDb.withSchema("maint");

// Plant names come from `auth.plant`. A typed cross-schema join is not
// expressible with the flattened codegen keys (each client is bound to one
// schema), so plant names are resolved with a second, auth-bound query and
// merged in JS. Catalog sizes make this a non-issue.
const authDb = rootDb.withSchema("auth");

async function plantNamesById(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await authDb
    .selectFrom("plant")
    .select(["plant_id", "name"])
    .where("plant_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.plant_id, r.name]));
}

export type AssetRow = Selectable<Asset>;
export type ProcessRow = Selectable<Process>;
export type RestrictionRow = Selectable<AssetRestriction>;
export type DocumentRow = Selectable<AssetDocument>;

/** Asset list row with the plant name and process names joined in. */
export interface AssetListRow extends AssetRow {
  plant_name: string;
  process_names: string[];
}

export interface AssetDetail {
  asset: AssetRow & { plant_name: string; parent_code: string | null };
  processes: ProcessRow[];
  restrictions: RestrictionRow[];
  documents: DocumentRow[];
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface ListAssetsFilter {
  plantId?: number;
  status?: string;
  activeOnly?: boolean;
}

export async function listAssets(
  filter: ListAssetsFilter = {},
): Promise<AssetListRow[]> {
  let q = db.selectFrom("asset").selectAll();
  if (filter.plantId !== undefined) {
    q = q.where("plant_id", "=", filter.plantId);
  }
  if (filter.status !== undefined) {
    q = q.where("status", "=", filter.status);
  }
  if (filter.activeOnly) {
    q = q.where("is_active", "=", true);
  }
  const assets = await q.orderBy("code", "asc").execute();
  if (assets.length === 0) return [];

  const [plantNames, links] = await Promise.all([
    plantNamesById([...new Set(assets.map((a) => a.plant_id))]),
    db
      .selectFrom("asset_process")
      .innerJoin("process", "process.process_id", "asset_process.process_id")
      .select(["asset_process.asset_id", "process.name"])
      .where(
        "asset_process.asset_id",
        "in",
        assets.map((a) => a.asset_id),
      )
      .execute(),
  ]);
  const byAsset = new Map<number, string[]>();
  for (const l of links) {
    const arr = byAsset.get(l.asset_id) ?? [];
    arr.push(l.name);
    byAsset.set(l.asset_id, arr);
  }
  return assets.map((a) => ({
    ...a,
    plant_name: plantNames.get(a.plant_id) ?? "",
    process_names: byAsset.get(a.asset_id) ?? [],
  }));
}

/** QR lookup: single asset by its unique code (the QR payload). */
export async function findAssetByCode(
  code: string,
): Promise<AssetRow | undefined> {
  const row = await db
    .selectFrom("asset")
    .selectAll()
    .where("code", "=", code)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function findAssetById(id: number): Promise<AssetRow | undefined> {
  const row = await db
    .selectFrom("asset")
    .selectAll()
    .where("asset_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

/** Full detail for the asset page: asset + processes + restrictions + documents. */
export async function getAssetDetail(
  assetId: number,
): Promise<AssetDetail | undefined> {
  const base = await db
    .selectFrom("asset")
    .leftJoin("asset as parent", "parent.asset_id", "asset.parent_asset_id")
    .selectAll("asset")
    .select("parent.code as parent_code")
    .where("asset.asset_id", "=", assetId)
    .executeTakeFirst();
  if (!base) return undefined;
  const plantNames = await plantNamesById([base.plant_id]);
  const asset = {
    ...base,
    plant_name: plantNames.get(base.plant_id) ?? "",
    parent_code: base.parent_code ?? null,
  };

  const [processes, restrictions, documents] = await Promise.all([
    db
      .selectFrom("asset_process")
      .innerJoin("process", "process.process_id", "asset_process.process_id")
      .selectAll("process")
      .where("asset_process.asset_id", "=", assetId)
      .orderBy("process.name", "asc")
      .execute(),
    db
      .selectFrom("asset_restriction")
      .selectAll()
      .where("asset_id", "=", assetId)
      .orderBy("restriction_id", "asc")
      .execute(),
    db
      .selectFrom("asset_document")
      .selectAll()
      .where("asset_id", "=", assetId)
      .orderBy("uploaded_at", "desc")
      .execute(),
  ]);
  return { asset, processes, restrictions, documents };
}

export interface CreateAssetInput {
  code: string;
  name: string;
  plant_id: number;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  location?: string | null;
  criticality?: string;
  status?: string;
  parent_asset_id?: number | null;
  acquisition_date?: Date | null;
  notes?: string | null;
}

export async function createAsset(input: CreateAssetInput): Promise<AssetRow> {
  const result = await db
    .insertInto("asset")
    .values({
      code: input.code.trim(),
      name: input.name.trim(),
      plant_id: input.plant_id,
      brand: emptyToNull(input.brand),
      model: emptyToNull(input.model),
      serial_number: emptyToNull(input.serial_number),
      location: emptyToNull(input.location),
      ...(input.criticality !== undefined
        ? { criticality: input.criticality }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      parent_asset_id: input.parent_asset_id ?? null,
      acquisition_date: input.acquisition_date ?? null,
      notes: emptyToNull(input.notes),
    })
    .output("inserted.asset_id")
    .executeTakeFirst();
  if (!result) throw new Error("Asset insert returned no identity");
  const row = await findAssetById(result.asset_id);
  if (!row) throw new Error("Asset not found after insert");
  return row;
}

export interface UpdateAssetInput {
  code?: string;
  name?: string;
  plant_id?: number;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  location?: string | null;
  criticality?: string;
  status?: string;
  parent_asset_id?: number | null;
  acquisition_date?: Date | null;
  notes?: string | null;
  is_active?: boolean;
}

export async function updateAsset(
  id: number,
  input: UpdateAssetInput,
): Promise<void> {
  const changes: Partial<Insertable<Asset>> = { updated_at: new Date() };
  if (input.code !== undefined && input.code.trim()) changes.code = input.code.trim();
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.plant_id !== undefined) changes.plant_id = input.plant_id;
  if (input.brand !== undefined) changes.brand = emptyToNull(input.brand);
  if (input.model !== undefined) changes.model = emptyToNull(input.model);
  if (input.serial_number !== undefined)
    changes.serial_number = emptyToNull(input.serial_number);
  if (input.location !== undefined) changes.location = emptyToNull(input.location);
  if (input.criticality !== undefined) changes.criticality = input.criticality;
  if (input.status !== undefined) changes.status = input.status;
  if (input.parent_asset_id !== undefined)
    changes.parent_asset_id = input.parent_asset_id;
  if (input.acquisition_date !== undefined)
    changes.acquisition_date = input.acquisition_date;
  if (input.notes !== undefined) changes.notes = emptyToNull(input.notes);
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db.updateTable("asset").set(changes).where("asset_id", "=", id).execute();
}

/** Soft-delete: assets are history-bearing (plans/WOs reference them). */
export async function softDeleteAsset(id: number): Promise<void> {
  await db
    .updateTable("asset")
    .set({ is_active: false, updated_at: new Date() })
    .where("asset_id", "=", id)
    .execute();
}

/**
 * Replace the asset ↔ process M:N in one transaction. The trx inherits the
 * `maint` schema binding — do not re-bind inside.
 */
export async function setAssetProcesses(
  assetId: number,
  processIds: number[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("asset_process").where("asset_id", "=", assetId).execute();
    if (processIds.length > 0) {
      await trx
        .insertInto("asset_process")
        .values(processIds.map((pid) => ({ asset_id: assetId, process_id: pid })))
        .execute();
    }
  });
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

export async function listProcesses(activeOnly = false): Promise<ProcessRow[]> {
  let q = db.selectFrom("process").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  return q.orderBy("name", "asc").execute();
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
  const row = await db
    .selectFrom("process")
    .selectAll()
    .where("process_id", "=", result.process_id)
    .executeTakeFirst();
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

/** Hard delete: blocked by FK when any asset still links the process. */
export async function deleteProcess(id: number): Promise<void> {
  await db.deleteFrom("process").where("process_id", "=", id).execute();
}

// ---------------------------------------------------------------------------
// Restrictions
// ---------------------------------------------------------------------------

export async function listRestrictionsByAsset(
  assetId: number,
): Promise<RestrictionRow[]> {
  return db
    .selectFrom("asset_restriction")
    .selectAll()
    .where("asset_id", "=", assetId)
    .orderBy("restriction_id", "asc")
    .execute();
}

export interface CreateRestrictionInput {
  asset_id: number;
  restriction_type: string;
  description: string;
}

export async function createRestriction(
  input: CreateRestrictionInput,
): Promise<RestrictionRow> {
  const result = await db
    .insertInto("asset_restriction")
    .values({
      asset_id: input.asset_id,
      restriction_type: input.restriction_type,
      description: input.description.trim(),
    })
    .output("inserted.restriction_id")
    .executeTakeFirst();
  if (!result) throw new Error("Restriction insert returned no identity");
  const row = await db
    .selectFrom("asset_restriction")
    .selectAll()
    .where("restriction_id", "=", result.restriction_id)
    .executeTakeFirst();
  if (!row) throw new Error("Restriction not found after insert");
  return row;
}

export interface UpdateRestrictionInput {
  restriction_type?: string;
  description?: string;
  is_active?: boolean;
}

export async function updateRestriction(
  id: number,
  input: UpdateRestrictionInput,
): Promise<void> {
  const changes: Partial<Insertable<AssetRestriction>> = {
    updated_at: new Date(),
  };
  if (input.restriction_type !== undefined)
    changes.restriction_type = input.restriction_type;
  if (input.description !== undefined && input.description.trim())
    changes.description = input.description.trim();
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db
    .updateTable("asset_restriction")
    .set(changes)
    .where("restriction_id", "=", id)
    .execute();
}

export async function softDeleteRestriction(id: number): Promise<void> {
  await db
    .updateTable("asset_restriction")
    .set({ is_active: false, updated_at: new Date() })
    .where("restriction_id", "=", id)
    .execute();
}

// ---------------------------------------------------------------------------
// Documents (metadata only — file bytes live in Azure Blob Storage)
// ---------------------------------------------------------------------------

export async function listDocumentsByAsset(
  assetId: number,
): Promise<DocumentRow[]> {
  return db
    .selectFrom("asset_document")
    .selectAll()
    .where("asset_id", "=", assetId)
    .orderBy("uploaded_at", "desc")
    .execute();
}

export async function findDocumentById(
  id: number,
): Promise<DocumentRow | undefined> {
  const row = await db
    .selectFrom("asset_document")
    .selectAll()
    .where("document_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreateDocumentInput {
  asset_id: number;
  doc_type: string;
  title: string;
  blob_path: string;
  content_type?: string | null;
  file_size_bytes?: number | null;
  uploaded_by: number;
}

export async function createDocument(
  input: CreateDocumentInput,
): Promise<DocumentRow> {
  const result = await db
    .insertInto("asset_document")
    .values({
      asset_id: input.asset_id,
      doc_type: input.doc_type,
      title: input.title.trim(),
      blob_path: input.blob_path,
      content_type: input.content_type ?? null,
      file_size_bytes: input.file_size_bytes ?? null,
      uploaded_by: input.uploaded_by,
    })
    .output("inserted.document_id")
    .executeTakeFirst();
  if (!result) throw new Error("Document insert returned no identity");
  const row = await findDocumentById(result.document_id);
  if (!row) throw new Error("Document not found after insert");
  return row;
}

/**
 * Soft-delete only: `plan_task.visual_aid_document_id` may reference the row,
 * and the blob is kept until an explicit cleanup pass.
 */
export async function softDeleteDocument(id: number): Promise<void> {
  await db
    .updateTable("asset_document")
    .set({ is_active: false })
    .where("document_id", "=", id)
    .execute();
}

// Enum domains live in src/lib/maintenance/enums.ts (pure module, shared with
// the client UI). Re-exported here so API routes keep one import site.
export {
  ASSET_STATUSES,
  ASSET_CRITICALITIES,
  RESTRICTION_TYPES,
  DOC_TYPES,
} from "@/modules/maintenance/enums";

function emptyToNull(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
