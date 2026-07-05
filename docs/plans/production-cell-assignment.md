---
id: production-cell-assignment
status: committed
created: 2026-07-03
touches:
  - docs/modules/maintenance.md
  - docs/modules/production.md (new)
  - docs/modules/navigation.md
migrations:
  - V11__produccion_schema.sql
supersedes: null
superseded_by: null
---

# Production cells & temporal asset assignment

## Objective

Split the physical asset identity (`maint.asset`, existing) from the logical
production structure (line → cell), linked by a **temporal assignment** that
replaces the free-text `maint.asset.location` field as the source of truth for
"where does this machine work". The model must support: a cell composed of
several assets (Laser 1 = laser machine + feed tower), one asset serving several
cells simultaneously (the feed tower serves Laser 1 and Laser 2), and historized
reassignment (moving a welder from Op 20 to another line closes the current row
and opens a new one — never overwrites). Assets are classified by
`asset_category` (`production_equipment` | `material_handling`) so mobile/shared
equipment (forklifts, hoists, tippers) is not forced into a fixed cell. Phase A
ships the schema plus the minimal UI to operate the model (lines/cells CRUD,
assign/reassign/close with history). This is the resource foundation the future
APS (production planning) will consume.

## Key facts grounding this plan

- `maint.asset` is **empty in EBI_dev** (0 rows — `data-analyst`, 2026-07-03),
  so the `DEFAULT 'production_equipment'` backfills nothing. When the real
  catalog is loaded, data entry must set `asset_category` explicitly for
  material-handling equipment; the default only suits manufacturing machinery.
- `maint.asset.location` (free text) is **not** dropped or deprecated by this
  plan; it coexists until a follow-up product decision retires it.
- Naming split is deliberate and mirrors `maint`/`maintenance.*`: SQL schema
  `produccion` (Spanish, anticipated by the module blueprint §1), module folder
  and permission/nav codes `production.*` (English).
- Plant scoping is app-enforced, not DB-enforced (no FK/CHECK ties a cell's
  plant to its assets' plant) — consistent with house style across schemas.

## Steps

1. ~~Materialize `db/migrations/V11__produccion_schema.sql`~~ (done at plan
   approval, applied to EBI_dev by the planning session).
2. `src/modules/production/db.ts` binding `rootDb.withSchema("produccion")`:
   - `production_line` CRUD (list with active filter, create, update).
   - `cell` CRUD (list, create, update; line + sequence validation:
     `sequence_in_line` only when `line_id` set — mirror of
     `CK_cell_sequence_requires_line`).
   - Assignments: `listCurrentByCell`, `listCurrentByAsset`,
     `listHistoryByAsset`, `listHistoryByCell`, `assign` (INSERT, `valid_from`
     defaults today), `close` (UPDATE `valid_to` on the current row only),
     `reassign` = close + assign in one transaction (transaction inherits the
     bound schema — do not re-bind). MSSQL inserts via
     `.output("inserted.<pk>")`.
   - Cross-schema reads (asset names for a cell's composition; plant names)
     resolved as separate per-schema queries merged in JS (house pattern).
3. `src/modules/production/enums.ts` (pure module, no I/O): `ASSET_CATEGORIES`
   mirroring `CK_asset_asset_category`.
4. Extend `src/modules/maintenance/enums.ts` + the asset create/edit form with
   `asset_category` (explicit select, no silent default in the UI — see Key
   facts). Machine detail gets a new **Ubicación** tab: current assignment(s) +
   history, read via `modules/production/db.ts` queries (app → modules
   direction holds; cross-module import is justified and one-way:
   maintenance UI reads production queries, never the reverse).
5. API routes (namespaced, mutations behind `requirePermission`):
   - `/api/production/lines` (GET list, POST `production.line:create`),
     `/api/production/lines/[id]` (GET, PATCH `production.line:update`, 404 on
     missing id).
   - `/api/production/cells` (GET, POST `production.cell:create`),
     `/api/production/cells/[id]` (GET incl. current composition, PATCH
     `production.cell:update`, 404 on missing id).
   - `/api/production/cells/[id]/assignments` (GET current+history, POST
     `production.assignment:create`),
     `/api/production/assignments/[id]/close` (POST
     `production.assignment:close`; 409 if already closed).
   - Reads require any authenticated user (v1 gates mutations only).
6. UI under `(portal)/production/*`:
   - `layout.tsx` calling `requireSectionOrRedirect("production")` (ADR 0005 —
     required step, do not omit).
   - `/production/lines`: kit `DataTable` list + create/edit modal (code, name,
     plant select).
   - `/production/cells`: list (columns: code, name, plant, line, seq, #current
     assets) + detail with composition (current assignments: asset code/name,
     role_label, valid_from) and actions assign / close / reassign; history
     table below (closed rows, read-only).
7. Extend `src/modules/navigation/icons.tsx`: add `Layers` and `LayoutGrid` to
   `NAV_ICON_NAMES` + the `NavIcon` switch (V11 seeds nav items referencing
   them).
8. `docs-sync` sub-agent: new `docs/database/erd/produccion.md`, patch
   `erd/maint.md` (new column), `docs/modules/production.md` from template,
   update `docs/modules/maintenance.md` (Ubicación tab, asset_category), add a
   routing row for this module type in `docs/docs-routing.md`.
9. Verify: `pnpm lint && pnpm build`; `flyway info` clean; visual/logic pass of
   the full flow — create a line with two sequenced cells, create standalone
   cells Laser 1 + Laser 2, assign one asset to each, assign a shared "feed
   tower" asset to both simultaneously, reassign an asset between cells and
   confirm history shows the closed row untouched; confirm a
   `material_handling` asset can exist with zero assignments. Gaps logged as
   amendments → `status: verified`.

## Database impact

Designed by the `dba` sub-agent (2026-07-03). **No irreversible operations** —
everything is additive:

- New schema `produccion` with 3 tables: `production_line`, `cell` (nullable
  `line_id` + filtered unique `(line_id, sequence_in_line)`),
  `asset_cell_assignment` (temporal bridge; filtered unique
  `(asset_id, cell_id) WHERE valid_to IS NULL` = one *current* row per pair
  while allowing real M:N concurrency; no `updated_at` by design — rows are
  immutable except closing `valid_to`).
- `ALTER maint.asset ADD asset_category` NOT NULL with DEFAULT (backfills in
  the same DDL statement; table is empty today) + `IX_asset_category`.
- Cross-schema FKs: `asset_cell_assignment.asset_id → maint.asset`,
  `.created_by → auth.app_user`; `cell.plant_id`/`production_line.plant_id →
  auth.plant`. All NO ACTION.
- Seeds: nav section `production` (dark-launch `is_active = 0`) + 2 items; 6
  `auth.permission` codes (`production.line:create|update`,
  `production.cell:create|update`, `production.assignment:create|close`). No
  `role_permission` rows (admin bypasses, ADR 0004).
- 7 new indexes + 1 on `maint.asset`, each tied to a named query pattern
  (current/history by asset, by cell, op sequence per line, pool-equipment
  anti-join). No existing index degraded. Low volume, no performance risk.

## Amendments

<!-- Appended during /build-plan verification; never edited into the sections above. -->

- 2026-07-03 — **Added `POST /api/production/assignments/[id]/reassign`** (not in
  the plan's endpoint list, but step 6's UI requires the action): transactional
  close+insert via `db.reassign`, gated by BOTH `production.assignment:close`
  and `:create`. Two sequential client calls would lose transactionality.
- 2026-07-03 — **`ASSET_CATEGORIES` canonical home = `production/enums.ts`**
  (plan step 3 left it open): V11 (this plan's migration) owns the CHECK, so the
  domain lives there; `maintenance/enums.ts` re-exports it. Import direction
  maintenance → production matches the already-justified one-way dependency.
- 2026-07-03 — **Nav-cache gotcha found during verification:** nav rows seeded
  by a migration do NOT invalidate the persisted `unstable_cache` `"nav"` tag,
  so `/production` redirected even for admin until a no-op
  `PUT /api/nav/sections/[id]` fired `revalidateTag("nav")`. Recorded in
  `docs/modules/production.md` (Do-not-touch) — applies to every future module
  migration that seeds nav rows.
- 2026-07-03 — Minor extras: `Categoría` catalog-filter column in the machines
  table (beyond the form field the plan asked for); `numUpdatedRows` compared
  via `Number()` (BigInt literal broke the ES2017 build target).
- 2026-07-03 — **Verification evidence:** 31/31 automated E2E checks passed
  against the dev server (login as `tester`; shared feed tower current in
  Láser 1 AND Láser 2 simultaneously; historized reassign keeps the closed row
  byte-identical; duplicate current pair → 409; seq-without-line → 422; dup seq
  in line → 409; close/re-close → 200/409; missing ids → 404;
  `material_handling` asset with zero assignments). Visual pass: cells list,
  cell detail (composition + actions), machine Ubicación tab showing the tower
  in both cells; no console errors. `pnpm lint` and `pnpm build` clean. Test
  rows remain in `EBI_dev` with suffix `-PCXU` (5 assets, 1 line, 4 cells,
  assignment history) — assignment history is append-only by design, so they
  were left as sample data rather than deleted.
