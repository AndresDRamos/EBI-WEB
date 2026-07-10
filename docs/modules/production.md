# production

**Last synced:** 2026-07-09 · **Synced from:** plan plant-layout-foundation
(branch `feat/plant-layout-foundation`, V13) on top of plan
production-cell-assignment (V11) + plan production-schema-rename (V12);
`currentCellNamesByAssets` added for the maintenance machines cards view (no
schema change); plan equipment-maintenance-attributes (V17) removed the
`ASSET_CATEGORIES` enum from `enums.ts` (asset category is now a `maint` DB
catalog); plan machines-locations-view (V18) added `cell.location_id` →
`org.location` and the app-enforced cell/asset location invariant on
assignments; **plan production-operative-cells (V19) collapsed the
line → cell two-level model into a single self-referencing `cell` and
replaced the old `/production/cells` + `/production/lines` table pages with
one "Celdas operativas" catalog view**; plan 5-cerrar-fronteras (layer-
boundaries refactor) extracted the reparenting invariant checks out of the
`PATCH /api/production/cells/[id]` route handler into `assertCellCanReparent`
in `db.ts` (no schema change)

## Purpose

Production-structure module of the EBI portal. Separates the physical asset
(`maint.asset`, owned by maintenance) from the production structure along two
axes:

- **Logical (V11, reshaped by V19):** a **single self-referencing hierarchy
  of "operative cells"** (`production.cell`), depth capped at 1 — a *parent*
  cell (e.g. a welding line) may have *child* cells (Op10 → Op20 → Op30), and
  a standalone cell is simply a parent with no children — plus a **temporal,
  historized M:N assignment** between assets and cells
  (`production.asset_cell_assignment`). It replaces the free-text
  `maint.asset.location` as the source of truth for where an asset works
  (that free-text column was dropped in V17). V11 also added
  `maint.asset.asset_category` as a CHECK enum — **superseded in V17**, which
  dropped the column and promoted the domain to the configurable catalogs
  `maint.asset_category` / `maint.asset_type` (owned by the maintenance
  module; an asset's category is derived via its type). Since V18 every cell
  sits inside a **named plant location** (`cell.location_id`, owned by the
  `org` module) — **NOT NULL since V19** (was optional in V18) — and
  assignments are constrained to cells sharing the asset's location
  (app-enforced). Since V19 a cell may also declare a `process_id` → the
  assignment APIs additionally require the asset's type to support that
  process (app-enforced, see "Do not touch" below).
- **Physical (V13, plan plant-layout-foundation):** digitized plant floor
  layouts as **versioned, immutable canvases** (`production.plant_layout`)
  imported from DXF per the CAD contract
  (`docs/architecture/cad-layout-contract.md`); per-asset top-view
  **footprints** (`production.asset_footprint`, small DXF or W×D rectangle);
  and a **temporal, historized placement** of assets on a layout
  (`production.asset_placement`) — the same close-+-insert invariant family
  as `asset_cell_assignment`. The source DXF is archived in Azure Blob; the
  normalized JSON is what the portal renders (ADR 0006).

## Responsibilities

- Owns the module slice `src/modules/production/`:
  - `db.ts` (cell + assignment tables; maintenance consumes its exports —
    including `currentCellNamesByAssets(assetIds)`, a batched single-query
    lookup of current cell names per asset from `asset_cell_assignment` where
    `valid_to IS NULL`, returned as `Map<number, string[]>`, consumed by the
    maintenance machines cards view) plus the V13 data layer
    `db/{shared,layout,footprint,placement}.ts`. Both bind the client with
    `withSchema("production")`; cross-schema display names (`org.plant` /
    `org.location` / `org.process`, `maint.asset`) resolve as separate
    per-schema queries merged in JS (`db/shared.ts` helpers in the layout
    layer; `locationRefsById` / `processNamesById` / `assetRefsById` in
    `db.ts`). **V19 rewrite:** `listLines`/`findLineById`/`createLine`/
    `updateLine` and the `LineRow`/`LineListRow` types are **gone** (the
    `production_line` table no longer exists); `createCell` now
    auto-generates the cell `code` (`{plant.code}-{location.code}-{NN}`,
    sequential **per location**, claimed under `UPDLOCK + SERIALIZABLE` from
    the new `production.cell_code_sequence` — mirrors `createAsset`'s
    matrícula pattern in maintenance) instead of accepting a caller-supplied
    code/plant/line; `updateCell` never accepts `code` or `location_id`
    (immutable — the code encodes the location); new `cellHasChildren`,
    `listCellChildren`, `reorderCellChildren` back the parent/child UI; new
    typed errors `CellLocationInvalidError` / `CellParentInvalidError` /
    `CellDepthExceededError` / `CellCodeOverflowError` / `CellHasChildrenError`
    (the API layer maps them to 422/409). Since plan 5-cerrar-fronteras,
    `assertCellCanReparent(cellId, locationId, parentCellId)` in `db.ts`
    owns the max-depth-1 reparenting invariant end-to-end (target parent
    active + same location + itself parentless, throwing
    `CellParentInvalidError`/`CellDepthExceededError`; `cellId` must not
    already have children, throwing `CellHasChildrenError`) — this used to
    be inline validation logic in the `PATCH /api/production/cells/[id]`
    route handler.
  - `dxf/` — the **pure** DXF import pipeline (no I/O, no `server-only`):
    `decode.ts` (UTF-8 for `$ACADVER >= AC1021`, `$DWGCODEPAGE` mapping for
    legacy files), `parse.ts` (`dxf-parser`, extracts the `EBI-*` layers),
    `validate.ts` (contract violations become a report of
    `error`/`warning`/`info` lines — never throws on bad content; extents
    plausibility 10–1000 m per side instead of trusting `$INSUNITS`),
    `normalize.ts` (translates the outline bbox minimum to (0,0)),
    `geometry.ts` (portal-owned JSON types + `rectangleFootprint`),
    `contract.ts` (constants mirroring the CAD contract doc), `index.ts`
    (`runLayoutImport` / `runFootprintImport`: bytes → `{ geometry, report,
    meta }`). Covered by 33 vitest unit tests in `dxf/__tests__/` (`pnpm
    test`; vitest is the repo's first test runner, added by this plan).
  - `enums.ts` — the V13 domains `LAYOUT_STATUSES` / `LAYOUT_STATUS_LABELS` /
    `layoutStatusLabel` and `FOOTPRINT_SOURCE_KINDS`. Still a pure module.
    `ASSET_CATEGORIES` **no longer lives here** (removed in V17; the file
    keeps an explanatory note): the asset-category domain is a configurable
    `maint` catalog owned by the maintenance module.
  - `components/` — module UI. **V19 replaced the old table-page components**
    (`cells-table-page.tsx`, `lines-table-page.tsx`, `cell-detail.tsx` — all
    deleted) with:
    - `operative-cells-page.tsx` (`OperativeCellsPage`) — the whole
      `/production/operative-cells` catalog in one client component: plant
      tabs (**local `useState`, not routes** — the whole catalog loads in one
      RSC pass, same approach as the maintenance machines cards page) filter
      the `org.location` cards shown as an `EntityCard` grid (kit
      `entity-card.tsx`); clicking a location card expands it (kit
      `ExpandingModal`) into `LocationCellsModal`.
    - `location-cells-modal.tsx` (`LocationCellsModal`) — one location's
      operative cells as cards (top-level cells only; children roll up),
      with an in-place drill-in per cell (`CellDetailView`): summary
      (size/process/Op badge), a **read-only "Operaciones de la línea"** list
      of children for parent cells with reorder buttons (persisted via
      `POST .../children/reorder`, disabled once the cell has no children —
      depth 1), and a **read-only "Composición vigente" + history** panel
      (`CellComposition`, fetched from `GET /cells/[id]/assignments`) — a
      note in the UI states assignments are *"Se gestiona desde
      Mantenimiento → Equipos"*. Creation (`CellFormDialog`) is
      **pre-filtered by location**: the form only asks name/size X·Y/process
      — no code, plant or location input; the code is server-generated.
    - the V13 pages are unchanged by V19: `layout-viewer-page` (+
      `layout-canvas`, an SVG canvas with its own pan/zoom — no d3),
      `layout-editor-page` (+ `layout-palette`: click-to-arm → click-to-place;
      existing placements drag with pointer capture; ±90° rotation buttons),
      `layout-import-wizard` (+ `validation-report-view`), `footprints-page`.
- Owns `/api/production/**`. Reads require any authenticated user
  (`requireUser`); mutations are gated by
  `requirePermission("production.<resource>:<action>")`. **V19 route
  surface** (replacing the V11 `lines[/[id]]` + `cells[/[id]]` pair):
  - `lines[/[id]]` routes are **deleted** — there is no more line entity.
  - `GET/POST /cells`, `GET/PATCH /cells/[id]` — cell CRUD. `POST` accepts
    `name`, `location_id` (required), `parent_cell_id` (optional),
    `size_x_m`/`size_y_m` (required on create), `process_id` (optional) —
    **no `code` and no `plant_id`**; validates the location is active,
    validates the parent (if any) shares the location and is itself a
    top-level cell (depth 1), then generates the code inside the same
    transaction that claims `cell_code_sequence`. `PATCH` accepts `name`,
    `parent_cell_id`, `size_x_m`/`size_y_m`, `process_id`, `is_active` —
    never `code` or `location_id`. Reassigning `parent_cell_id` calls
    `assertCellCanReparent` (`db.ts`, plan 5-cerrar-fronteras), which checks
    **both directions**: the target parent must not itself have a parent,
    and the cell being reparented must not already have children of its own
    (`cellHasChildren`).
  - `POST /cells/[id]/children/reorder` (new, V19,
    `production.cell:update`) — persists a full new Op10/Op20… order for one
    parent's children; the body must list exactly the parent's current
    children (any status) or it 422s; `reorderCellChildren` applies it in two
    passes (negative temp sequences, then the final `(i+1)*10`) to dodge the
    filtered unique index `UQ_cell_parent_sequence` mid-update.
  - `cells/[id]/assignments`, `assignments/[id]/{close,reassign}` — unchanged
    surface from V11, but the **create/reassign validations gained a second
    check in V19**: alongside the V18 location match
    (`cell.location_id === asset.location_id`), when `cell.process_id` is
    set the asset's type must support that process
    (`assetTypeSupportsProcess(asset.asset_type_id, cell.process_id)` from
    `modules/maintenance/db.ts`) — 422 otherwise, app-enforced, no triggers.

  V13 routes (unchanged by V19):
  - `GET /layouts` — versions per plant, **excluding the `geometry` LOB**
    (list discipline); `GET /layouts/[id]` returns the parsed geometry.
  - `POST /layouts/import` (`layout:create`) — multipart DXF (max 50 MB →
    413). The pipeline runs in memory first; **only a contract-valid file
    archives its blob and lands as a draft** (blob-first, then row). A
    failing file returns 422 with the full validation report and persists
    nothing — the report is not stored (V13 has no report column; the
    archived DXF makes it reproducible).
  - `DELETE /layouts/[id]` (`layout:create`) — discard a draft (its trial
    placements go with it); active/archived → 409.
  - `POST /layouts/[id]/confirm` (`layout:activate`) — one transaction:
    archives the previous active version, closes its open placements,
    activates the draft and **carries the placements forward** onto the new
    version (the actor authors the carried rows).
  - `POST /layouts/[id]/archive` (`layout:archive`) — retire the active
    layout without a successor; its open placements close.
  - `GET/POST /layouts/[id]/placements` (`placement:create`) — create
    validates that the asset's plant (derived since V18 via
    `maint.asset.location_id → org.location.plant_id`) matches
    `plant_layout.plant_id` (the cross-schema invariant the DB cannot enforce
    without triggers) and that the position falls inside the canvas → 422;
    duplicate current placement → 409 (`UQ_asset_placement_current`).
  - `POST /placements/[id]/move` — requires **both** `placement:close` and
    `placement:create` (it closes AND creates, mirroring `reassign`);
    close+insert in one transaction. `POST /placements/[id]/close` — 409 if
    already closed.
  - `GET /footprints`, `GET/PUT /footprints/[assetId]`
    (`footprint:manage`) — PUT is dual-mode: JSON `source_kind: "rectangle"`
    (0 < m ≤ 100) or multipart DXF (422 + report on contract failure;
    blob archived only on success).
- Owns the `(portal)/production/*` UI. **V19 replaced the whole surface**:
  `/production` now redirects straight to `/production/operative-cells`
  (`page.tsx` — `redirect("/production/operative-cells")`); the old
  `Líneas`/`Celdas` table pages and the standalone cell-detail view are
  **deleted**. `/production/operative-cells/page.tsx` is the only route: one
  RSC pass loads `listCells` + `listPlants` + `listLocations` +
  `listProcesses` and hands them to `OperativeCellsPage` (client component,
  see Responsibilities above). The segment `layout.tsx` still gates that tree
  with `requireSectionOrRedirect("production")` (per-page nav authz, ADR 0008
  supersedes 0005) — unchanged by V19.
- **The layout UI is dark-parked under `(portal)/test/*`** (re-scope decision
  2026-07-06, V14): `/test/layout` (viewer), `/test/layout/import` (wizard),
  `/test/layout/edit` (editor), `/test/footprints` (reached via a header
  button in the viewer). `/test/` is the portal's private component proving
  ground — **admin-only** (`assertAdminOrRedirect`, same check as the
  Administración panel) and deliberately outside the nav registry (no
  section, no items). V13 seeded a `Layout` nav item; **V14 removed it** —
  the module returns to the portal nav only when its practical use is
  validated (re-seed + move pages back). The `Map` icon stays in the curated
  set (`src/components/kit/nav-icon.tsx` — moved here from
  `src/modules/navigation/icons.tsx` by plan 5-cerrar-fronteras) for that
  future re-entry.
- Owns the temporal invariants: `reassign` (assignments) and `movePose`
  (placements) are the only sanctioned "moves" — close + insert in one
  transaction; `closeAssignment`/`closePlacement` only touch rows still
  current (`false` → API 409). `activateDraft`/`archiveActive`/`discardDraft`
  in `db/layout.ts` are the only layout lifecycle mutations; geometry is
  never updated in place.
- Uses (does not own) `src/lib/storage/blob.ts`, generalized by the
  plant-layout-foundation plan: `BLOB_CONTAINERS = { maintenance, production }`
  are **code constants**, not env vars (user decision 2026-07-06 — env vars
  are for secrets only; the single env input is
  `AZURE_STORAGE_CONNECTION_STRING`). Uploads go through
  `uploadBlob(container, key, …)` + `buildBlobKey(prefix, filename)`.
- Does **not** own assets (`maint.asset`), plants (`org.plant` since V15) or
  locations (`org.location`, V18) — placements/footprints/assignments/cells
  reference them; `findAssetById` from `maintenance/db.ts` and location/
  process lookups from `org/db/locations.ts` / `org/db/processes.ts` back the
  API layer's 422 validations. **Assignments (asset ↔ cell) are managed
  exclusively from the maintenance equipment modal** (the Ubicación row in
  `machine-modal.tsx`) — this was already the case before V19; V19's
  `LocationCellsModal` composition panel is explicitly **read-only** and
  says so in the UI copy.

## Dependency flow

- `(portal)/production/operative-cells/page.tsx` → `modules/production/db.ts`
  (`listCells`) + `modules/org/db/org.ts` (`listPlants`) +
  `modules/org/db/locations.ts` (`listLocations`) +
  `modules/org/db/processes.ts` (`listProcesses`) — app-layer composition,
  allowed by the blueprint. The V13 `(portal)/test/*` pages keep their own
  dependency shape (`db/*.ts` + `modules/org/db/org.ts` +
  `modules/maintenance/db.ts` for asset pickers), unchanged by V19.
- `/api/production/**` → `modules/production/db{.ts,/}` +
  `modules/production/dxf` (import routes) + `lib/storage/blob.ts` (blob
  archiving) + `maintenance/db.{findAssetById,assetTypeSupportsProcess}` and
  `org/db/{locations.findLocationById,processes.findProcessById}` (422
  validations — asset existence, location∈plant, cell/asset location match,
  cell/asset process match).
- `modules/production/dxf/` is pure and side-effect-free: imported by API
  routes, UI copy and tests alike; blob archiving and DB rows are strictly
  the API layer's job (ADR 0006).
- `modules/production/db/*` → `production.*` via the schema-bound client;
  cross-schema lookups run as separate per-schema queries merged in JS (typed
  cross-schema joins are not expressible with the flattened codegen keys).
- Module-code direction with maintenance is **one-way, maintenance →
  production** for reads (`listHistoryByAsset` for the Ubicación tab,
  `currentCellNamesByAssets` for the machines cards view). The reverse
  direction (`production → maintenance`, added V19) is the two new 422
  validations in the assignment routes calling
  `maintenance/db.{findAssetById,assetTypeSupportsProcess}` — API-route-level
  composition, not a module import: `src/modules/production/` still does not
  import from `src/modules/maintenance/`. The former enums re-export
  (`ASSET_CATEGORIES`) was removed in V17.

## Related ADRs

- [ADR 0002 — Azure Blob for asset documents](../architecture/adr/0002-azure-blob-asset-documents.md) (amended 2026-07-06: container names are code constants; pattern generalized to the `production` container)
- [ADR 0004 — Role as access profile](../architecture/adr/0004-role-as-access-profile.md) (admin bypass; no `role_permission` seeds)
- [ADR 0008 — Page grants authorize pages](../architecture/adr/0008-page-grants-authorize-pages.md) (per-page segment guard; supersedes 0005)
- [ADR 0006 — DXF is the source, normalized JSON is the truth](../architecture/adr/0006-dxf-source-normalized-json-truth.md) (import pipeline; immutable layout versions)
- [CAD layout contract](../architecture/cad-layout-contract.md) (`EBI-*` layers, `EBI_PORT_IN/OUT` blocks, meters, closed polylines, export recipe)

## Do not touch without reading

- **Never UPDATE `asset_id`/`cell_id` in place on `asset_cell_assignment`,
  and never UPDATE `x_m`/`y_m`/`rotation_deg` in place on
  `asset_placement`.** A move is close (`valid_to`) + insert in one
  transaction (`reassign` / `movePose`). Both tables have **no `updated_at`
  on purpose** — do not add one.
- **`plant_layout.geometry` is never edited in place.** A correction is a new
  upload = a new draft version (ADR 0006). The only sanctioned mutations are
  the lifecycle transitions in `db/layout.ts`; `activateDraft` archives the
  previous active **before** activating (otherwise `UQ_plant_layout_active`
  fires mid-transaction) and carries open placements forward.
- **`UQ_asset_placement_current` is per `(layout_id, asset_id)`, NOT per
  asset globally — on purpose.** A draft layout can be populated while the
  active layout still holds the live position (draft-preparation overlap).
  Physical truth = current placement JOIN layout WHERE `status = 'active'`.
  Do not "tighten" it.
- **Pose semantic (app-level, not in the DB):** `x_m`/`y_m` = **center of the
  footprint bbox**, rotation about that center. `layout-canvas.tsx`, the
  placement APIs and any future consumer must agree on this; changing it
  silently shifts every stored placement.
- **`modules/production/dxf/` must stay pure** (no `server-only`, no I/O):
  the API layer owns blob/DB side effects; the pipeline is what the 33 unit
  tests cover. Contract violations must become report lines, never throws —
  an untraced architect file must yield a useful 422 report, not a crash.
  `contract.ts` mirrors `docs/architecture/cad-layout-contract.md`: change
  the doc first.
- **`src/modules/production/enums.ts` must stay a pure module**: imported by
  client components and API validation. (Since V17 `maintenance/enums.ts` no
  longer imports from it.)
- **The filtered unique index `UQ_asset_cell_assignment_current` permits real
  current M:N** — do not tighten it to one cell per asset (shared feed
  towers).
- **The cell/asset location invariant is app-enforced in exactly two places**
  (V18): assignment create (`cells/[id]/assignments`) and `reassign` both
  422 unless `cell.location_id === asset.location_id`; the maintenance asset
  PATCH auto-closes assignments when the asset moves. Adding a new assignment
  code path without that check silently breaks the invariant — there are no
  triggers backing it.
- **The cell/asset process invariant is app-enforced in the same two places**
  (V19): when `cell.process_id IS NOT NULL`, assignment create and
  `reassign` both 422 unless `assetTypeSupportsProcess(asset.asset_type_id,
  cell.process_id)` returns true. A cell with `process_id = NULL` accepts any
  asset type (no gate). Adding a new assignment code path must repeat both
  checks (location **and** process) — neither is backed by a trigger.
- **Cell hierarchy depth is capped at 1, app-enforced only** (V19, no CHECK
  can express it): `createCell` rejects a `parent_cell_id` whose target
  already has a parent (`CellDepthExceededError`); the `PATCH
  /api/production/cells/[id]` route calls `assertCellCanReparent` (`db.ts`,
  centralized by plan 5-cerrar-fronteras — previously inline in the route)
  which additionally rejects setting `parent_cell_id` on a cell that already
  has children (`cellHasChildren` → `CellHasChildrenError`). The DB only
  backs `CK_cell_not_self_parent` (`parent_cell_id ≠ cell_id`) — it has no
  way to express "no grandparents". Any new cell-creation/reparenting code
  path must repeat both directions of this check (via `assertCellCanReparent`
  for the reparent case).
- **`cell.code` is app-generated and immutable — never accept it from a
  caller, never let `updateCell` change it or `location_id`.** `createCell`
  claims `production.cell_code_sequence.next_seq` (keyed by `location_id`)
  under `UPDLOCK + SERIALIZABLE` inside the insert transaction, mirroring
  `maint.asset`'s matrícula generator (V17/V18). `CellCodeOverflowError`
  when the 2-digit sequence (max 99 per location) would overflow.
- **`cell.sequence_in_parent` requires `parent_cell_id`**
  (`CK_cell_sequence_requires_parent`, renamed from
  `CK_cell_sequence_requires_line` in V19); `db.ts` normalizes (clears the
  sequence when the parent is cleared) — keep that normalization if you touch
  `createCell`/`updateCell`. `reorderCellChildren` writes negative temporary
  sequences before the final `(i+1)*10` pass — do not collapse that into a
  single pass, it exists to dodge `UQ_cell_parent_sequence` mid-update.
  `sequence_in_parent` (like the old `sequence_in_line`) is a hint for
  ordering, not a slot reservation — the API does not currently prevent
  gaps or reassigning the same numeric slot to two different Op steps at
  different times (only true duplicates at the same instant, via the
  filtered unique index).
- **Nav-cache gotcha after migrations that seed nav rows** (applies to the
  V19 `Celdas operativas` item exactly as to V11/V13): seeded rows do **not**
  invalidate the persisted `unstable_cache` tagged `"nav"` — trigger any
  `/api/navigation/nav/*` mutation or restart with a cold cache, or the
  section guard keeps redirecting even for admins.
- **Assignment management lives only in the maintenance equipment modal.**
  `LocationCellsModal`'s composition panel (`CellComposition`) is
  **read-only by design** (fetches `GET /cells/[id]/assignments`, no create/
  close/reassign UI) — do not add assignment mutation controls there without
  first checking whether this decision (plan production-operative-cells) has
  been revisited; duplicating the flow would fork the location/process
  validation logic across two UIs.
- **Blob container names are code constants** (`BLOB_CONTAINERS` in
  `lib/storage/blob.ts`) — do not reintroduce per-container env vars;
  per-environment separation comes from the connection string.
