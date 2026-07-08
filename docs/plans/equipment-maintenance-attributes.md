---
id: equipment-maintenance-attributes
status: committed
created: 2026-07-08
touches: [maintenance, production]
migrations: [V17]
supersedes: null
superseded_by: null
---

# Equipment maintenance attributes redesign

## Objective

Redesign the attributes stored per equipment in the **Maintenance** module and
the modal that captures them, so an asset is described by an auto-generated
license-plate code, a configurable `asset_category → asset_type` taxonomy, an
equipment photo, and a location sourced from production cells (not free text).
The capture modal is reorganized (photo box, single-select process, month/year
install date, parent-asset preview) and the asset taxonomy becomes
user-configurable from a **Catálogos** tab beside the equipment cards. The test
catalog is purged so the module starts clean for real data.

Concretely:

- **`code`** stops being user-assignable and becomes an **auto-generated
  matrícula** `{category.code_prefix}-P{plant_id}-{NNNN}` (e.g. `PRD-P1-0001`),
  sequential per (category, plant), prefix configurable per category.
- **`asset_category`** stops being a CHECK enum and becomes a **configurable
  catalog** (`maint.asset_category`) carrying the matrícula `code_prefix`.
- **`asset_type`** is a new **configurable catalog** (`maint.asset_type`)
  grouping machine types **under** a category (hierarchy category → type). An
  asset picks a **type**; its category is **derived** via the type (never
  stored redundantly on `asset`).
- **`name`, `brand`, `model`, `serial_number`** are the primary captured fields.
- **`process`** stays an M:N in the DB (`maint.asset_process`) but the modal
  exposes a **single-select dropdown** (saved as a 1-element set).
- **`location`** column is **dropped**; physical location is read from
  `production.asset_cell_assignment → cell` (already the source of truth).
- **`acquisition_date` → `installation_date`**, relabelled "Fecha de
  instalación", captured as an approximate **month + year** (Spanish),
  stored as a `date` with day = 01.
- **`criticality`** is removed from the form/edits (column kept, unchanged).
- **`parent_asset_id`** capture expands the modal to the right into a search
  panel that previews the chosen parent as a **read-only, filled** asset card.
- **Equipment photo**: new `image_blob_path` column (single primary photo in
  Azure Blob, container `maintenance`), captured from a box in the modal's
  top-left.

## Steps

> Persistence phase (this planning session) covers steps 1–2; the build
> (`/build-plan`) covers steps 3–9. Verification gates `/commit-plan`.

1. **Migration (persistence phase — done by the planner).** Materialize
   `db/migrations/V17__maint_asset_catalog_redesign.sql` exactly as designed by
   the `dba` sub-agent (see **Database impact**): 3 new tables
   (`asset_category`, `asset_type`, `asset_code_sequence`), the `maint.asset`
   column changes, the 6 permission-code seeds, grants, idempotent guards.
   Register V17 in `docs/database/migrations-log.md`. Apply to `EBI_dev`
   (`flyway -configFiles=db/flyway.dev.conf -configFiles=db/flyway.dev.local.conf
   migrate` → clean `flyway info` → `pnpm db:gen`). The 6 test assets were
   purged from `EBI_dev` by the user beforehand (the `ADD asset_type_id NOT
   NULL` requires an empty table). Azure Blob cleanup of the orphaned document /
   layout blobs is the user's responsibility.

2. **Seed at least the initial taxonomy is NOT required** — the catalog UI (step
   7) lets the user create types; the two categories `production_equipment` /
   `material_handling` are seeded by V17 with prefixes `PRD` / `MMH`. Note the
   ordering constraint for the executor: **an asset cannot be created until at
   least one `asset_type` exists** (`asset.asset_type_id` is NOT NULL) — the
   create-equipment flow must guide the user to the Catálogos tab first, or
   disable "Nuevo equipo" while no type exists.

3. **Enums / module purity.** `asset_category` is no longer a fixed enum:
   - Remove `ASSET_CATEGORIES` / `ASSET_CATEGORY_LABELS` / `assetCategoryLabel`
     from `src/modules/production/enums.ts` and the re-export in
     `src/modules/maintenance/enums.ts`. Category + type labels now come from
     the DB catalog. Keep `enums.ts` files pure (no I/O). `status`,
     `criticality`, `restriction`, `doc_type` enums stay as-is.
   - Audit every consumer found in the plan's grep set
     (`machine-cards.tsx`, `machine-detail.tsx`, `machines-cards-page.tsx`,
     `machine-form-dialog.tsx`, `api/maintenance/assets/**`,
     `(portal)/maintenance/machines/**`) and switch category/type display to the
     DB-sourced label.

4. **`maintenance/db.ts`.**
   - New catalog reads/writes: `listAssetCategories`, `createAssetCategory`,
     `updateAssetCategory`, `softDelete/deleteAssetCategory`; `listAssetTypes`
     (with category), `createAssetType`, `updateAssetType`,
     `deleteAssetType`. Follow the MSSQL `.output("inserted.<pk>")` +
     re-select pattern and the `withSchema("maint")` binding already in the
     file. Catalog deletes 409 on FK by design (an asset referencing a type;
     a type referencing a category).
   - `createAsset`: drop `code`, `location`, `asset_category` from the input;
     add `asset_type_id`, `image_blob_path`, `installation_date`. Generate the
     matrícula **inside the insert transaction** using the exact algorithm the
     `dba` specified (resolve category + `code_prefix` from the chosen type,
     claim `next_seq` from `maint.asset_code_sequence` under
     `UPDLOCK, SERIALIZABLE`, build `${prefix}-P${plant_id}-${seq.padStart(4)}`,
     insert, rely on `UQ_asset_code` as the backstop; roll back atomically).
     Guard `seq <= 9999`.
   - `updateAsset`: drop `code` (immutable once generated), `location`,
     `asset_category`; add `asset_type_id`, `image_blob_path`,
     `installation_date`. `criticality` stays updatable at the DB layer but is
     no longer sent by the form.
   - `listAssets` / `getAssetDetail`: resolve `type_name` + derived
     `category_name` / `category_id` via a `maint.asset_type` (+`asset_category`)
     join; drop `location`; expose `installation_date`, `image_blob_path`.

5. **API.**
   - `POST /api/maintenance/assets`: no `code` in the payload (server
     generates it); require `asset_type_id`, `plant_id`, `name`. Keep
     `requirePermission("maintenance.asset:create")`.
   - `PATCH /api/maintenance/assets/[id]`: accept `asset_type_id`,
     `image_blob_path`, `installation_date`; reject `code`/`location`.
   - **Image upload**: an endpoint that accepts the photo, stores it in the
     `maintenance` blob container via `src/lib/storage/blob.ts`, and returns the
     `blob_path` the client persists into `image_blob_path` (gate with
     `maintenance.asset:update`, or a dedicated code if preferred — reuse
     `asset:update` to avoid new codes). Serve the image via a SAS redirect like
     the document downloads.
   - **Catalog CRUD**: `/api/maintenance/asset-categories/**` and
     `/api/maintenance/asset-types/**`, each mutation gated by the matching
     seeded permission (`maintenance.asset_category:*` /
     `maintenance.asset_type:*`); GETs on `requireUser`.

6. **Machine modal** (`machine-form-dialog.tsx`).
   - Remove the **Código** field; show a read-only hint ("Se generará
     automáticamente al guardar"). Remove **Criticidad** and **Ubicación**.
   - Add an **image box top-left**: upload/preview the equipment photo
     (calls the upload endpoint; stores `image_blob_path`).
   - Primary fields: **name, brand, model, serial_number**.
   - **Type select grouped by category** (optgroups per active category); the
     derived category is shown read-only. Enforce a type is chosen.
   - **Process**: a **single-select dropdown** over `org.process`, saved via
     `setAssetProcesses(assetId, [processId])`.
   - **Fecha de instalación**: month + year selects in Spanish (no day);
     serialize to `YYYY-MM-01`.
   - **Parent asset**: a control that **expands the modal to the right** into a
     search panel (search existing assets by code/name), rendering the selected
     parent as a **read-only, fully-filled asset card/preview** (the same form
     shape, disabled) before confirming the assignment into `parent_asset_id`.

7. **Catálogos tab** (new). Turn `/maintenance/machines` into a tabbed area via
   the kit `PageTabs` (route-aware):
   - **Equipos** → the existing cards view (`machines-cards-page.tsx`).
   - **Catálogos** → a `GroupedDataTable` modeled exactly on
     `departments-roles-page.tsx` (Departamento→Rol), but **Categoría → Tipos**:
     categories as parent groups (editable `name` + `code_prefix`), types as
     child rows (editable `name`, per-category add-child), CRUD on both levels
     gated by `useCan()` + the new permissions. Route it as a static sibling
     segment so it wins over `/maintenance/machines/[code]` in Next.js
     (`/maintenance/machines/catalogs`), or lift tabs to a shared layout — the
     executor picks the cleaner routing, keeping the machine detail
     (`[code]`) working.

8. **Cards / detail display.** Show the equipment photo, the type and derived
   category badge; remove `location` from the Datos tab; keep the read-only
   Ubicación tab (cells) as-is; the matrícula is the card's code chip.

9. **docs-sync + verify.** Run `docs-sync` (updates `docs/database/erd/maint.md`,
   `docs/database/dictionary/maint.md`, `docs/modules/maintenance.md`). Verify:
   `pnpm lint && pnpm build` pass, `flyway info` clean, and a visual/logic pass
   of the create/edit flow (matrícula generated, photo, type→category, single
   process, install month/year, parent preview) + catalog CRUD. Log gaps as
   amendments.

## Design spec (no Claude Design export for this plan)

No `design/<slug>.dc.html` was produced. Reuse existing kit components:
`EntityFormDialog` (modal chrome; the parent-search right panel is a new
extension of the modal body), `PageTabs`, `GroupedDataTable`, `EntityCard`,
`ActiveInactiveToggle`. Follow EZI identity (charcoal `#373a36`, orange
`#ff5c35`, Montserrat, minimalist industrial). The Catálogos table mirrors the
Departamento→Rol grouped table already in the admin panel.

## Database impact

Designed by the `dba` sub-agent. Single migration **V17** (structural +
permission seed); the test-data purge is a **manual dev step run by the user**
(not versioned — destructive DML must not replay on prod, which is already
empty).

**V17 — `maint` schema:**

- **New `maint.asset_category`** (configurable catalog, replaces the V11 CHECK):
  `asset_category_id` PK, `code` (UNIQUE), `name`, `code_prefix` (UNIQUE, feeds
  the matrícula), `is_active`, timestamps. Seeds `production_equipment`/`PRD`
  and `material_handling`/`MMH`.
- **New `maint.asset_type`** (configurable catalog, category → type hierarchy):
  `asset_type_id` PK, `asset_category_id` FK (no cascade), `code`, `name`,
  `is_active`, timestamps; `UQ_asset_type_category_code (asset_category_id, code)`
  (also FK-support index). No seed rows.
- **New `maint.asset_code_sequence`**: `(asset_category_id, plant_id)` PK,
  `next_seq` — race-safe matrícula counter, incremented under `UPDLOCK,
  SERIALIZABLE` in the app's insert transaction (no triggers, no DB default).
  FKs to `asset_category` and `org.plant` (no cascade).
- **`maint.asset` changes**: `+asset_type_id INT NOT NULL` (FK, `IX_asset_type`);
  `+image_blob_path NVARCHAR(400) NULL`; **rename** `acquisition_date` →
  `installation_date` (stays `date`); **DROP** `asset_category` (+ its default +
  CHECK + `IX_asset_category`); **DROP** `location`. `code` stays
  `NVARCHAR(32)` UNIQUE, now app-generated.
- **Grants**: covered by V5's `SCHEMA::maint` grants; re-asserted idempotently.

**V17 — `auth` schema (permission seed):** idempotent MERGE adds 6 codes —
`maintenance.asset_category:{create,update,delete}`,
`maintenance.asset_type:{create,update,delete}`. No `role_permission` seeds
(admin bypasses at the app layer). No nav-item seed (Catálogos is a tab).

### ⚠️ Irreversible operations

1. **DROP `maint.asset.asset_category`** (+ default + CHECK + `IX_asset_category`)
   — the category string is discarded; category is henceforth derived via the
   type. One-way.
2. **DROP `maint.asset.location`** — free-text location is discarded; location
   now comes from `production.asset_cell_assignment → cell`. One-way.
3. **Rename `acquisition_date → installation_date`** — semantically one-way
   (no data loss; table empty).
4. **Test-data purge + `DBCC CHECKIDENT RESEED, 0`** (run by the user in dev):
   deletes the 6 assets and all dependents across `maint`/`production` and
   resets identity. Irreversible. **Azure Blob** objects (2 `asset_document`
   blobs + layout/footprint DXFs) are NOT touched by SQL — orphaned, cleaned by
   the user from the `maintenance`/`production` containers (`ezistorage`).

### Index / performance notes

- Dropped `IX_asset_category` (column gone). Category filtering now joins
  `asset_type` (served by `IX_asset_type` + `UQ_asset_type_category_code`).
- New uniqueness: `UQ_asset_category_code`, `UQ_asset_category_prefix` (prefix
  uniqueness guarantees matrícula uniqueness across categories per plant),
  `UQ_asset_type_category_code`. Existing `UQ_asset_code` is the final backstop.
- `asset_code_sequence` PK is the exact seek path of the generator's single-row
  locked UPDATE; contention is bounded to concurrent inserts within the same
  (category, plant).

## Amendments

- 2026-07-08 — **V17 first `flyway migrate` failed** (error 4922 dropping
  `asset_category`): the `OBJECT_ID(N'DF_asset_asset_category')` /
  `CK_…` / `FK_asset_type` guards were not schema-qualified, resolved under
  `dbo`, returned NULL, and skipped the constraint drops. Qualified all three
  to `maint.…` and re-applied cleanly (the failed attempt rolled back whole).
  Objective unaffected.
- 2026-07-08 — **Kit `PageTabs`: longest-match activation.** With nested tab
  hrefs (`/maintenance/machines` vs `/maintenance/machines/catalogs`) the old
  prefix rule highlighted both tabs; now only the longest matching href
  activates. No behavior change for the admin tabs (sibling routes).
- 2026-07-08 — **Kit `GroupedDataTable`: Spanish pluralization.** The child
  count hardcoded `+ "es"` ("tipo" → "tipoes"); now defaults to vowel→`+s`,
  else `+es`, with an optional `childNounPlural` override. "rol" → "roles"
  unchanged. Found in the visual pass of the Catálogos tab.
- 2026-07-08 — **Image upload gate is an inline create-OR-update check**, not
  a single `requirePermission` code: the photo is uploaded before the asset
  row exists in the create flow, so the endpoint (`POST
  /api/maintenance/assets/image`) is asset-agnostic and accepts either
  `maintenance.asset:create` or `maintenance.asset:update` (admin bypasses).
  Within the plan's "reuse asset:update" intent, widened to include create.
- 2026-07-08 — **Verification data left in `EBI_dev`:** the E2E pass (13/13
  checks: matrícula PRD-P1-0001…0003 sequence, parent link, single-process
  PATCH, joins, legacy-field rejection, FK 409s) created 3 assets, 1 asset
  type (`verify_laser`) and a sequence row. Cleanup SQL handed to the user
  (assets have no hard-delete endpoint by design).
