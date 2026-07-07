import "server-only";
import { db as rootDb } from "@/lib/db/client";
import type { Selectable, Insertable } from "kysely";
import type {
  Asset,
  AssetDocument,
  AssetRestriction,
  Process,
} from "@/lib/db/types";

// `asset`, `asset_process`, `asset_restriction`, `asset_document` live in the
// `maint` schema. kysely-codegen drops the schema from the generated keys, so
// bind the client to `maint` or SQL Server looks under dbo and 208s.
const db = rootDb.withSchema("maint");

// Plant AND process both moved to the `org` schema in V15 (process was
// promoted out of `maint` to become the canonical company-wide catalog). A
// typed cross-schema join is not expressible with the flattened codegen keys
// (each client binds one schema), so `asset_process` (maint) links to process
// names via a second, `org`-bound query merged in JS. Catalog sizes make this
// a non-issue.
const orgDb = rootDb.withSchema("org");

async function plantNamesById(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await orgDb
    .selectFrom("plant")
    .select(["plant_id", "name"])
    .where("plant_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.plant_id, r.name]));
}

/** Process names by id, from `org.process` (for the asset-process JS merge). */
async function processNamesById(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await orgDb
    .selectFrom("process")
    .select(["process_id", "name"])
    .where("process_id", "in", ids)
    .execute();
  return new Map(rows.map((r) => [r.process_id, r.name]));
}

/** Full process rows an asset runs, ordered by name (maint links → org rows). */
async function assetProcessRows(assetId: number): Promise<ProcessRow[]> {
  const links = await db
    .selectFrom("asset_process")
    .select("process_id")
    .where("asset_id", "=", assetId)
    .execute();
  const ids = links.map((l) => l.process_id);
  if (ids.length === 0) return [];
  return orgDb
    .selectFrom("process")
    .selectAll()
    .where("process_id", "in", ids)
    .orderBy("name", "asc")
    .execute();
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

  // asset_process (maint) links to process names in org: fetch the link rows,
  // then resolve names from org and merge (no cross-schema join possible).
  const links = await db
    .selectFrom("asset_process")
    .select(["asset_id", "process_id"])
    .where(
      "asset_id",
      "in",
      assets.map((a) => a.asset_id),
    )
    .execute();
  const [plantNames, processNames] = await Promise.all([
    plantNamesById([...new Set(assets.map((a) => a.plant_id))]),
    processNamesById([...new Set(links.map((l) => l.process_id))]),
  ]);
  const byAsset = new Map<number, string[]>();
  for (const l of links) {
    const name = processNames.get(l.process_id);
    if (!name) continue;
    const arr = byAsset.get(l.asset_id) ?? [];
    arr.push(name);
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
    assetProcessRows(assetId),
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
  asset_category?: string;
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
      ...(input.asset_category !== undefined
        ? { asset_category: input.asset_category }
        : {}),
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
  asset_category?: string;
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
  if (input.asset_category !== undefined)
    changes.asset_category = input.asset_category;
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
// Processes — the catalog moved to the `org` schema in V15 and is administered
// from the admin panel (`/admin/organization/processes`). Maintenance still
// needs READ access (the asset↔process picker in the machine detail, the QR
// flows), so re-export the org reads here to keep import sites stable. The
// write CRUD lives in `@/modules/org/db/processes`.
// ---------------------------------------------------------------------------
export { listProcesses, findProcessById } from "@/modules/org/db/processes";

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

export async function findRestrictionById(
  id: number,
): Promise<RestrictionRow | undefined> {
  const row = await db
    .selectFrom("asset_restriction")
    .selectAll()
    .where("restriction_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
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
  ASSET_CATEGORIES,
  RESTRICTION_TYPES,
  DOC_TYPES,
} from "@/modules/maintenance/enums";

function emptyToNull(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
