import "server-only";
import { sql, type Selectable, type Insertable } from "kysely";
import type {
  Asset,
  AssetCategory,
  AssetType,
  AssetDocument,
  AssetRestriction,
  Process,
} from "@/lib/db/types";
import { maintDb as db, orgDb, emptyToNull } from "@/lib/db/schema-clients";
import { locationRefsById, processNamesById } from "@/lib/db/refs";

/** Whether an asset type supports a given process — backs the operative-cells
 * invariant (app-enforced, no triggers) that an asset can only be assigned to
 * a cell whose declared process its type supports. */
export async function assetTypeSupportsProcess(
  assetTypeId: number,
  processId: number,
): Promise<boolean> {
  const row = await db
    .selectFrom("asset_type_process")
    .select("asset_type_id")
    .where("asset_type_id", "=", assetTypeId)
    .where("process_id", "=", processId)
    .executeTakeFirst();
  return row !== undefined;
}

/** Process ids per asset type (V18: processes are a property of the TYPE,
 * not of each unit — `asset_type_process` replaced `asset_process`). */
async function typeProcessIdsByType(
  typeIds: number[],
): Promise<Map<number, number[]>> {
  if (typeIds.length === 0) return new Map();
  const links = await db
    .selectFrom("asset_type_process")
    .select(["asset_type_id", "process_id"])
    .where("asset_type_id", "in", typeIds)
    .execute();
  const map = new Map<number, number[]>();
  for (const l of links) {
    const arr = map.get(l.asset_type_id) ?? [];
    arr.push(l.process_id);
    map.set(l.asset_type_id, arr);
  }
  return map;
}

/** Full process rows an asset TYPE runs, ordered by name (maint links → org rows). */
async function typeProcessRows(typeId: number): Promise<ProcessRow[]> {
  const ids = (await typeProcessIdsByType([typeId])).get(typeId) ?? [];
  if (ids.length === 0) return [];
  return orgDb
    .selectFrom("process")
    .selectAll()
    .where("process_id", "in", ids)
    .orderBy("name", "asc")
    .execute();
}

export type AssetRow = Selectable<Asset>;
export type AssetCategoryRow = Selectable<AssetCategory>;
export type AssetTypeRow = Selectable<AssetType>;
export type ProcessRow = Selectable<Process>;
export type RestrictionRow = Selectable<AssetRestriction>;
export type DocumentRow = Selectable<AssetDocument>;

/** Type name + prefix + derived category (asset → asset_type → asset_category). */
interface TypeInfo {
  type_name: string;
  asset_category_id: number;
  category_name: string;
  code_prefix: string;
}

/** Resolve type/category info for a set of asset_type ids (both live in maint).
 * Since V18 the matrícula prefix lives on the TYPE, not the category. */
async function typeInfoById(ids: number[]): Promise<Map<number, TypeInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom("asset_type as t")
    .innerJoin("asset_category as c", "c.asset_category_id", "t.asset_category_id")
    .select([
      "t.asset_type_id as asset_type_id",
      "t.name as type_name",
      "t.asset_category_id as asset_category_id",
      "c.name as category_name",
      "t.code_prefix as code_prefix",
    ])
    .where("t.asset_type_id", "in", ids)
    .execute();
  return new Map(
    rows.map((r) => [
      r.asset_type_id,
      {
        type_name: r.type_name,
        asset_category_id: r.asset_category_id,
        category_name: r.category_name,
        code_prefix: r.code_prefix,
      },
    ]),
  );
}

/** Asset list row with location (plant derived), type-derived processes and
 * type/category names. */
export interface AssetListRow extends AssetRow {
  location_name: string;
  plant_id: number;
  plant_name: string;
  process_names: string[];
  process_ids: number[];
  type_name: string;
  asset_category_id: number;
  category_name: string;
}

export interface AssetDetail {
  asset: AssetRow & {
    location_name: string;
    plant_id: number;
    plant_name: string;
    parent_code: string | null;
    type_name: string;
    asset_category_id: number;
    category_name: string;
  };
  processes: ProcessRow[];
  restrictions: RestrictionRow[];
  documents: DocumentRow[];
}

/** Thrown when createAsset is given an asset_type_id that is missing/inactive. */
export class AssetTypeInvalidError extends Error {
  constructor() {
    super("El tipo de equipo no existe o está inactivo.");
    this.name = "AssetTypeInvalidError";
  }
}

/** Thrown when createAsset is given a location_id that is missing/inactive. */
export class AssetLocationInvalidError extends Error {
  constructor() {
    super("La ubicación no existe o está inactiva.");
    this.name = "AssetLocationInvalidError";
  }
}

/** Thrown when the 4-digit matrícula sequence is exhausted for (type, plant). */
export class AssetCodeOverflowError extends Error {
  constructor() {
    super("Se agotó la numeración de matrícula para este tipo y planta.");
    this.name = "AssetCodeOverflowError";
  }
}

// ---------------------------------------------------------------------------
// Asset categories (configurable catalog — since V18 the matrícula code_prefix
// lives on the TYPE, not here)
// ---------------------------------------------------------------------------

export async function listAssetCategories(
  activeOnly = false,
): Promise<AssetCategoryRow[]> {
  let q = db.selectFrom("asset_category").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  return q.orderBy("name", "asc").execute();
}

export async function findAssetCategoryById(
  id: number,
): Promise<AssetCategoryRow | undefined> {
  const row = await db
    .selectFrom("asset_category")
    .selectAll()
    .where("asset_category_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreateAssetCategoryInput {
  code: string;
  name: string;
}

export async function createAssetCategory(
  input: CreateAssetCategoryInput,
): Promise<AssetCategoryRow> {
  const result = await db
    .insertInto("asset_category")
    .values({
      code: input.code.trim(),
      name: input.name.trim(),
    })
    .output("inserted.asset_category_id")
    .executeTakeFirst();
  if (!result) throw new Error("Asset category insert returned no identity");
  const row = await findAssetCategoryById(result.asset_category_id);
  if (!row) throw new Error("Asset category not found after insert");
  return row;
}

export interface UpdateAssetCategoryInput {
  code?: string;
  name?: string;
  is_active?: boolean;
}

export async function updateAssetCategory(
  id: number,
  input: UpdateAssetCategoryInput,
): Promise<void> {
  const changes: Partial<Insertable<AssetCategory>> = { updated_at: new Date() };
  if (input.code !== undefined && input.code.trim()) changes.code = input.code.trim();
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db
    .updateTable("asset_category")
    .set(changes)
    .where("asset_category_id", "=", id)
    .execute();
}

export async function softDeleteAssetCategory(id: number): Promise<void> {
  await db
    .updateTable("asset_category")
    .set({ is_active: false, updated_at: new Date() })
    .where("asset_category_id", "=", id)
    .execute();
}

/** Hard delete: 409s (FK) when a type or an asset still references the category. */
export async function deleteAssetCategory(id: number): Promise<void> {
  await db
    .deleteFrom("asset_category")
    .where("asset_category_id", "=", id)
    .execute();
}

// ---------------------------------------------------------------------------
// Asset types (configurable catalog — grouped under a category; since V18 the
// type carries the matrícula code_prefix and its process links)
// ---------------------------------------------------------------------------

/** Type row extended with its process links (V18: 1 type → N processes; the
 * UI edits it as a single select for now). */
export interface AssetTypeWithProcesses extends AssetTypeRow {
  process_ids: number[];
  process_names: string[];
}

export async function listAssetTypes(
  activeOnly = false,
): Promise<AssetTypeWithProcesses[]> {
  let q = db.selectFrom("asset_type").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  const types = await q.orderBy("name", "asc").execute();
  if (types.length === 0) return [];
  const processIds = await typeProcessIdsByType(types.map((t) => t.asset_type_id));
  const processNames = await processNamesById([
    ...new Set([...processIds.values()].flat()),
  ]);
  return types.map((t) => {
    const ids = processIds.get(t.asset_type_id) ?? [];
    return {
      ...t,
      process_ids: ids,
      process_names: ids.flatMap((id) => {
        const name = processNames.get(id);
        return name ? [name] : [];
      }),
    };
  });
}

export async function findAssetTypeById(
  id: number,
): Promise<AssetTypeRow | undefined> {
  const row = await db
    .selectFrom("asset_type")
    .selectAll()
    .where("asset_type_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreateAssetTypeInput {
  asset_category_id: number;
  code: string;
  name: string;
  code_prefix: string;
  /** Process links (N:M in DB; the UI sends 0 or 1 for now). */
  process_ids?: number[];
}

export async function createAssetType(
  input: CreateAssetTypeInput,
): Promise<AssetTypeRow> {
  const newId = await db.transaction().execute(async (trx) => {
    const result = await trx
      .insertInto("asset_type")
      .values({
        asset_category_id: input.asset_category_id,
        code: input.code.trim(),
        name: input.name.trim(),
        code_prefix: input.code_prefix.trim().toUpperCase(),
      })
      .output("inserted.asset_type_id")
      .executeTakeFirst();
    if (!result) throw new Error("Asset type insert returned no identity");
    if (input.process_ids && input.process_ids.length > 0) {
      await trx
        .insertInto("asset_type_process")
        .values(
          input.process_ids.map((pid) => ({
            asset_type_id: result.asset_type_id,
            process_id: pid,
          })),
        )
        .execute();
    }
    return result.asset_type_id;
  });
  const row = await findAssetTypeById(newId);
  if (!row) throw new Error("Asset type not found after insert");
  return row;
}

export interface UpdateAssetTypeInput {
  asset_category_id?: number;
  code?: string;
  name?: string;
  code_prefix?: string;
  is_active?: boolean;
}

export async function updateAssetType(
  id: number,
  input: UpdateAssetTypeInput,
): Promise<void> {
  const changes: Partial<Insertable<AssetType>> = { updated_at: new Date() };
  if (input.asset_category_id !== undefined)
    changes.asset_category_id = input.asset_category_id;
  if (input.code !== undefined && input.code.trim()) changes.code = input.code.trim();
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.code_prefix !== undefined && input.code_prefix.trim())
    changes.code_prefix = input.code_prefix.trim().toUpperCase();
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db
    .updateTable("asset_type")
    .set(changes)
    .where("asset_type_id", "=", id)
    .execute();
}

/**
 * Replace the type ↔ process M:M in one transaction (V18 — replaces the old
 * per-asset `setAssetProcesses`). The trx inherits the `maint` binding.
 */
export async function setAssetTypeProcesses(
  typeId: number,
  processIds: number[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("asset_type_process")
      .where("asset_type_id", "=", typeId)
      .execute();
    if (processIds.length > 0) {
      await trx
        .insertInto("asset_type_process")
        .values(
          processIds.map((pid) => ({ asset_type_id: typeId, process_id: pid })),
        )
        .execute();
    }
  });
}

export async function softDeleteAssetType(id: number): Promise<void> {
  await db
    .updateTable("asset_type")
    .set({ is_active: false, updated_at: new Date() })
    .where("asset_type_id", "=", id)
    .execute();
}

/** Hard delete: 409s (FK) when an asset still references the type. Process
 * links are config OF the type, so they are cleared in the same transaction. */
export async function deleteAssetType(id: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("asset_type_process")
      .where("asset_type_id", "=", id)
      .execute();
    await trx.deleteFrom("asset_type").where("asset_type_id", "=", id).execute();
  });
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface ListAssetsFilter {
  locationId?: number;
  status?: string;
  activeOnly?: boolean;
}

export async function listAssets(
  filter: ListAssetsFilter = {},
): Promise<AssetListRow[]> {
  let q = db.selectFrom("asset").selectAll();
  if (filter.locationId !== undefined) {
    q = q.where("location_id", "=", filter.locationId);
  }
  if (filter.status !== undefined) {
    q = q.where("status", "=", filter.status);
  }
  if (filter.activeOnly) {
    q = q.where("is_active", "=", true);
  }
  const assets = await q.orderBy("code", "asc").execute();
  if (assets.length === 0) return [];

  // Processes derive from the asset's TYPE (V18); location resolves the plant.
  const typeIds = [...new Set(assets.map((a) => a.asset_type_id))];
  const [locationRefs, typeInfo, processIdsByType] = await Promise.all([
    locationRefsById([...new Set(assets.map((a) => a.location_id))]),
    typeInfoById(typeIds),
    typeProcessIdsByType(typeIds),
  ]);
  const processNames = await processNamesById([
    ...new Set([...processIdsByType.values()].flat()),
  ]);
  return assets.map((a) => {
    const ti = typeInfo.get(a.asset_type_id);
    const loc = locationRefs.get(a.location_id);
    const pids = processIdsByType.get(a.asset_type_id) ?? [];
    return {
      ...a,
      location_name: loc?.name ?? "",
      plant_id: loc?.plant_id ?? 0,
      plant_name: loc?.plant_name ?? "",
      process_names: pids.flatMap((id) => {
        const name = processNames.get(id);
        return name ? [name] : [];
      }),
      process_ids: pids,
      type_name: ti?.type_name ?? "",
      asset_category_id: ti?.asset_category_id ?? 0,
      category_name: ti?.category_name ?? "",
    };
  });
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
  const [locationRefs, typeInfo] = await Promise.all([
    locationRefsById([base.location_id]),
    typeInfoById([base.asset_type_id]),
  ]);
  const ti = typeInfo.get(base.asset_type_id);
  const loc = locationRefs.get(base.location_id);
  const asset = {
    ...base,
    location_name: loc?.name ?? "",
    plant_id: loc?.plant_id ?? 0,
    plant_name: loc?.plant_name ?? "",
    parent_code: base.parent_code ?? null,
    type_name: ti?.type_name ?? "",
    asset_category_id: ti?.asset_category_id ?? 0,
    category_name: ti?.category_name ?? "",
  };

  const [processes, restrictions, documents] = await Promise.all([
    typeProcessRows(base.asset_type_id),
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
  name: string;
  location_id: number;
  asset_type_id: number;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  parent_asset_id?: number | null;
  installation_date?: Date | null;
  image_blob_path?: string | null;
  notes?: string | null;
}

/**
 * Create an asset with an auto-generated matrícula
 * `{type.code_prefix}-P{plant_id}-{NNNN}`, sequential per (type, plant) since
 * V18 — the plant is the location's plant at birth (moving the asset later
 * shows in its location, the code never changes). One transaction: resolve
 * the type's prefix + the location's plant, claim the next sequence value
 * under UPDLOCK+SERIALIZABLE (race-safe, per the dba design), build the code,
 * insert. `UQ_asset_code` is the final backstop.
 */
export async function createAsset(input: CreateAssetInput): Promise<AssetRow> {
  // Resolve the birth plant from the (active) location — org-bound query, so
  // it runs before the maint transaction (read-only, no atomicity needed).
  const location = await orgDb
    .selectFrom("location")
    .select(["location_id", "plant_id"])
    .where("location_id", "=", input.location_id)
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (!location) throw new AssetLocationInvalidError();
  const plantId = location.plant_id;

  const newId = await db.transaction().execute(async (trx) => {
    // 1. Resolve the prefix from the chosen (active) type.
    const typeRow = await trx
      .selectFrom("asset_type")
      .select(["asset_type_id", "code_prefix"])
      .where("asset_type_id", "=", input.asset_type_id)
      .where("is_active", "=", true)
      .executeTakeFirst();
    if (!typeRow) throw new AssetTypeInvalidError();

    // 2. Claim the next sequence value atomically. SERIALIZABLE + UPDLOCK takes
    //    a key-range lock even when the (type, plant) row does not yet exist,
    //    so concurrent first-inserts serialize instead of racing the PK.
    const claimed = await sql<{ seq: number }>`
      DECLARE @seq INT;
      UPDATE maint.asset_code_sequence WITH (UPDLOCK, SERIALIZABLE)
        SET @seq = next_seq, next_seq = next_seq + 1
        WHERE asset_type_id = ${typeRow.asset_type_id}
          AND plant_id = ${plantId};
      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO maint.asset_code_sequence (asset_type_id, plant_id, next_seq)
        VALUES (${typeRow.asset_type_id}, ${plantId}, 2);
        SET @seq = 1;
      END
      SELECT @seq AS seq;
    `.execute(trx);
    const seq = claimed.rows[0]?.seq;
    if (!seq) throw new Error("Could not claim asset code sequence");
    if (seq > 9999) throw new AssetCodeOverflowError();
    const code = `${typeRow.code_prefix}-P${plantId}-${String(seq).padStart(4, "0")}`;

    // 3. Insert the asset with the generated code.
    const result = await trx
      .insertInto("asset")
      .values({
        code,
        name: input.name.trim(),
        location_id: input.location_id,
        asset_type_id: input.asset_type_id,
        brand: emptyToNull(input.brand),
        model: emptyToNull(input.model),
        serial_number: emptyToNull(input.serial_number),
        parent_asset_id: input.parent_asset_id ?? null,
        installation_date: input.installation_date ?? null,
        image_blob_path: emptyToNull(input.image_blob_path),
        notes: emptyToNull(input.notes),
      })
      .output("inserted.asset_id")
      .executeTakeFirst();
    if (!result) throw new Error("Asset insert returned no identity");
    return result.asset_id;
  });
  const row = await findAssetById(newId);
  if (!row) throw new Error("Asset not found after insert");
  return row;
}

export interface UpdateAssetInput {
  name?: string;
  location_id?: number;
  asset_type_id?: number;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  parent_asset_id?: number | null;
  installation_date?: Date | null;
  image_blob_path?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export async function updateAsset(
  id: number,
  input: UpdateAssetInput,
): Promise<void> {
  const changes: Partial<Insertable<Asset>> = { updated_at: new Date() };
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.location_id !== undefined) changes.location_id = input.location_id;
  if (input.asset_type_id !== undefined) changes.asset_type_id = input.asset_type_id;
  if (input.brand !== undefined) changes.brand = emptyToNull(input.brand);
  if (input.model !== undefined) changes.model = emptyToNull(input.model);
  if (input.serial_number !== undefined)
    changes.serial_number = emptyToNull(input.serial_number);
  if (input.parent_asset_id !== undefined)
    changes.parent_asset_id = input.parent_asset_id;
  if (input.installation_date !== undefined)
    changes.installation_date = input.installation_date;
  if (input.image_blob_path !== undefined)
    changes.image_blob_path = emptyToNull(input.image_blob_path);
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

// ---------------------------------------------------------------------------
// Processes — the catalog moved to the `org` schema in V15 and is administered
// from the admin panel (`/admin/organization/processes`). Maintenance still
// needs READ access (the type↔process picker in the catalogs tab), so
// re-export the org reads here to keep import sites stable. The write CRUD
// lives in `@/modules/org/db/processes`. Since V18 the process link hangs off
// the asset TYPE (`asset_type_process`) — there is no per-asset link anymore.
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

// Enum domains live in src/modules/maintenance/enums.ts (pure module, shared
// with the client UI). Re-exported here so API routes keep one import site.
export {
  ASSET_STATUSES,
  RESTRICTION_TYPES,
  DOC_TYPES,
} from "@/modules/maintenance/enums";
