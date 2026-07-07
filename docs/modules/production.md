# production

**Last synced:** 2026-07-06 · **Synced from:** plan plant-layout-foundation (branch `feat/plant-layout-foundation`, V13) on top of plan production-cell-assignment (V11) + plan production-schema-rename (V12)

## Purpose

Production-structure module of the EBI portal. Separates the physical asset
(`maint.asset`, owned by maintenance) from the production structure along two
axes:

- **Logical (V11):** line → cell, with a **temporal, historized M:N
  assignment** between assets and cells (`production.asset_cell_assignment`).
  It replaces the free-text `maint.asset.location` as the source of truth for
  where an asset works (the free-text column still exists until a future
  decision). V11 also added `maint.asset.asset_category`
  (`production_equipment` | `material_handling`).
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
  - `db.ts` (V11 tables — untouched by V13; maintenance consumes its exports)
    plus the V13 data layer `db/{shared,layout,footprint,placement}.ts`. Both
    bind the client with `withSchema("production")`; cross-schema display
    names (`org.plant` since V15, `maint.asset`) resolve as separate per-schema
    queries merged in JS (`db/shared.ts` helpers).
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
  - `enums.ts` — **canonical** home of `ASSET_CATEGORIES` (re-exported by
    `maintenance/enums.ts`) plus the V13 domains `LAYOUT_STATUSES` /
    `LAYOUT_STATUS_LABELS` / `layoutStatusLabel` and
    `FOOTPRINT_SOURCE_KINDS`. Still a pure module.
  - `components/` — module UI, including the V13 pages: `layout-viewer-page`
    (+ `layout-canvas`, an SVG canvas with its own pan/zoom — no d3),
    `layout-editor-page` (+ `layout-palette`: click-to-arm → click-to-place;
    existing placements drag with pointer capture; ±90° rotation buttons),
    `layout-import-wizard` (+ `validation-report-view`), `footprints-page`.
- Owns `/api/production/**`. Reads require any authenticated user
  (`requireUser`); mutations are gated by
  `requirePermission("production.<resource>:<action>")`. V11 routes:
  `lines[/[id]]`, `cells[/[id]]`, `cells/[id]/assignments`,
  `assignments/[id]/{close,reassign}`. V13 routes:
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
    validates `maint.asset.plant_id = plant_layout.plant_id` (the
    cross-schema invariant the DB cannot enforce without triggers) and that
    the position falls inside the canvas → 422; duplicate current placement →
    409 (`UQ_asset_placement_current`).
  - `POST /placements/[id]/move` — requires **both** `placement:close` and
    `placement:create` (it closes AND creates, mirroring `reassign`);
    close+insert in one transaction. `POST /placements/[id]/close` — 409 if
    already closed.
  - `GET /footprints`, `GET/PUT /footprints/[assetId]`
    (`footprint:manage`) — PUT is dual-mode: JSON `source_kind: "rectangle"`
    (0 < m ≤ 100) or multipart DXF (422 + report on contract failure;
    blob archived only on success).
- Owns the `(portal)/production/*` UI: `/production` redirects to the cell
  catalog; `Líneas`/`Celdas` list pages and the cell detail (V11). The segment
  `layout.tsx` gates that tree with `requireSectionOrRedirect("production")`
  (ADR 0005).
- **The layout UI is dark-parked under `(portal)/test/*`** (re-scope decision
  2026-07-06, V14): `/test/layout` (viewer), `/test/layout/import` (wizard),
  `/test/layout/edit` (editor), `/test/footprints` (reached via a header
  button in the viewer). `/test/` is the portal's private component proving
  ground — **admin-only** (`assertAdminOrRedirect`, same check as the
  Administración panel) and deliberately outside the nav registry (no
  section, no items). V13 seeded a `Layout` nav item; **V14 removed it** —
  the module returns to the portal nav only when its practical use is
  validated (re-seed + move pages back). The `Map` icon stays in the curated
  set (`src/modules/navigation/icons.tsx`) for that future re-entry.
- Owns the temporal invariants: `reassign` (assignments) and `movePose`
  (placements) are the only sanctioned "moves" — close + insert in one
  transaction; `closeAssignment`/`closePlacement` only touch rows still
  current (`false` → API 409). `activateDraft`/`archiveActive`/`discardDraft`
  in `db/layout.ts` are the only layout lifecycle mutations; geometry is
  never updated in place.
- Uses (does not own) `src/lib/storage/blob.ts`, generalized by this plan:
  `BLOB_CONTAINERS = { maintenance, production }` are **code constants**, not
  env vars (user decision 2026-07-06 — env vars are for secrets only; the
  single env input is `AZURE_STORAGE_CONNECTION_STRING`;
  `AZURE_STORAGE_CONTAINER_MAINT` was removed and maintenance call sites
  updated). Uploads go through `uploadBlob(container, key, …)` +
  `buildBlobKey(prefix, filename)`.
- Does **not** own assets (`maint.asset`) or plants (`org.plant` since V15) —
  placements/footprints/assignments reference them; `findAssetById` from
  `maintenance/db.ts` validates asset existence/plant in the API layer.

## Dependency flow

- `(portal)/production/*` pages → `modules/production/db.ts` + `db/*.ts` +
  `modules/org/db/org.ts` (plant options) + `modules/maintenance/db.ts`
  (asset pickers — app-layer composition, allowed by the blueprint).
- `/api/production/**` → `modules/production/db{.ts,/}` +
  `modules/production/dxf` (import routes) + `lib/storage/blob.ts` (blob
  archiving) + `maintenance/db.findAssetById` (422 validation).
- `modules/production/dxf/` is pure and side-effect-free: imported by API
  routes, UI copy and tests alike; blob archiving and DB rows are strictly
  the API layer's job (ADR 0006).
- `modules/production/db/*` → `production.*` via the schema-bound client;
  cross-schema lookups run as separate per-schema queries merged in JS (typed
  cross-schema joins are not expressible with the flattened codegen keys).
- Module-code direction with maintenance is **one-way, maintenance →
  production** for enums/history reads; nothing in `src/modules/production/`
  imports from `src/modules/maintenance/` (only app routes compose both).

## Related ADRs

- [ADR 0002 — Azure Blob for asset documents](../architecture/adr/0002-azure-blob-asset-documents.md) (amended 2026-07-06: container names are code constants; pattern generalized to the `production` container)
- [ADR 0004 — Role as access profile](../architecture/adr/0004-role-as-access-profile.md) (admin bypass; no `role_permission` seeds)
- [ADR 0005 — Section grants authorize pages](../architecture/adr/0005-section-grants-authorize-pages.md) (segment guard)
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
  client components, API validation **and `maintenance/enums.ts`**.
- **The filtered unique index `UQ_asset_cell_assignment_current` permits real
  current M:N** — do not tighten it to one cell per asset (shared feed
  towers).
- **Nav-cache gotcha after migrations that seed nav rows** (applies to the
  V13 `Layout` item exactly as to V11): seeded rows do **not** invalidate the
  persisted `unstable_cache` tagged `"nav"` — trigger any `/api/nav/*`
  mutation or restart with a cold cache, or the section guard keeps
  redirecting even for admins.
- **`cell.sequence_in_line` requires `line_id`**
  (`CK_cell_sequence_requires_line`); `db.ts` normalizes (clears the sequence
  when the line is cleared) — keep that normalization if you touch
  `createCell`/`updateCell`.
- **Blob container names are code constants** (`BLOB_CONTAINERS` in
  `lib/storage/blob.ts`) — do not reintroduce per-container env vars;
  per-environment separation comes from the connection string.
