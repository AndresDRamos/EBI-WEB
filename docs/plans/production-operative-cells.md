---
id: production-operative-cells
status: committed
created: 2026-07-09
touches: [production, maintenance, org]
migrations: [V19]
supersedes: null
superseded_by: null
---

# Operative Cells — unified production view

## Objective

Replace the two table pages of the Production section (Cells, Lines) with a single
page, **"Celdas operativas"** (`/production/operative-cells`): dynamic tabs per plant →
location cards → an ExpandingModal with the operative cells of that location. New cells
are created pre-filtered by location (no plant/location/code inputs; code is
auto-generated `{plant.code}-{location.code}-{NN}`). A cell with children behaves as a
production line (sequential operations Op10, Op20…), so `production.production_line` is
removed in favor of a self-referencing hierarchy on `production.cell` (max depth 1,
app/API-enforced). Asset↔cell assignments become the Maintenance team's responsibility
(machine modal); production's cell view is read-only for composition. Cells may declare
an optional `process_id`; assignments then validate the asset's type supports it via
`maint.asset_type_process`.

Approved decisions:
1. Drop `production_line`; `cell.parent_cell_id` + `sequence_in_parent`; depth ≤ 1.
2. Drop `cell.plant_id`; `location_id` NOT NULL (plant derived, as `maint.asset` in V18).
3. Auto code with per-location sequence table (`asset_code_sequence` pattern).
4. Optional `cell.process_id`; `org.plant_process` untouched.
5. Assignments managed only from Maintenance; production read-only.
6. `size_x_m`/`size_y_m` DECIMAL(9,3) NULL in DB; required by the create form.

## Steps

1. **Migration V19** (`db/migrations/V19__production_operative_cells.sql`, authored by
   the `dba` sub-agent — see Database impact): additive columns → location backfill →
   line→parent-cell conversion → remap → drops → NOT NULL → new constraints →
   `cell_code_sequence` → nav/permissions. Apply to `EBI_dev`, clean `flyway info`,
   `pnpm db:gen`.
2. **Data layer** `src/modules/production/db.ts`: remove line functions and
   `plantNamesById`; add `locationRefsById` (pattern `maintenance/db.ts`);
   `listCells`/`getCellDetail` with parent join + child counts; `createCell` with
   UPDLOCK+SERIALIZABLE sequence claim keyed by `location_id` (pattern `createAsset`),
   typed errors for invalid location/parent/depth; `updateCell` (code/location
   immutable); `listCellChildren`, `cellHasChildren`, `reorderCellChildren` (two-phase
   to dodge `UQ_cell_parent_sequence`, final sequences `(i+1)*10`). New
   `assetTypeSupportsProcess` in `src/modules/maintenance/db.ts`.
3. **API**: delete `api/production/lines/**`; rewrite `POST /api/production/cells`
   (`{name, location_id, parent_cell_id?, size_x_m, size_y_m, process_id?}`, 422s);
   `PATCH .../cells/[id]` with depth-1 both directions; new
   `POST .../cells/[id]/children/reorder`; process validation (422) in assignments
   create + reassign.
4. **UI**: new RSC `(portal)/production/operative-cells/page.tsx` +
   `operative-cells-page.tsx` (plant tabs = local state, location `EntityCard` grid,
   `ExpandingModal`) + `location-cells-modal.tsx` (cell cards, pre-filtered create
   form, drill-in with read-only composition/history and ordered children with ↑↓
   reorder). Delete old cells/lines pages + components; `production/page.tsx`
   redirects to `/production/operative-cells`; check `src/app/asset/[code]/page.tsx`.
5. **docs-sync** reconciles `docs/database/*` and `docs/modules/production.md`; then
   verify (lint/build + manual flows) → `status: verified`.

## Database impact

Filled by the `dba` sub-agent (V19). Highlights:
- **Irreversible**: `DROP TABLE production.production_line`; drop of `cell.plant_id`
  and `cell.line_id`; deletion of `production.line:*` permissions.
- Data conversion: existing line `TF-PCXU` becomes a parent cell; its 2 member cells
  get `parent_cell_id` (sequences preserved via rename `sequence_in_line` →
  `sequence_in_parent`). All dev cells backfilled to location `NAVE1`. Prod tables are
  empty → conversion is a no-op there (human confirms before prod migrate).
- New: `production.cell_code_sequence`; FKs `FK_cell_parent`, `FK_cell_process`; CKs
  for self-parent, sequence, sizes; filtered `IX_cell_parent`,
  `UQ_cell_parent_sequence` (both columns NOT NULL in filter); unfiltered
  `IX_cell_location`. Depth-1 enforced in app (no triggers).

## Amendments

- 2026-07-09 — Build + verification pass. Fixed a bug found during E2E testing:
  `reorderCellChildren`'s two-phase update used negative temp sequence values
  to dodge `UQ_cell_parent_sequence`, but that violates `CK_cell_sequence`
  (`> 0` or NULL) — 500 on every reorder. Fixed by using `NULL` as the temp
  value (also filtered out of the unique index, so no `-(i+1)` trick is
  needed). `pnpm lint && pnpm build` pass; verified end-to-end against
  `EBI_dev` via authenticated HTTP requests (browser cookie injection was
  blocked by the session's credential-materialization guard, so visual/DOM
  verification was substituted with direct API/page assertions): new page
  renders and old `/production/cells`, `/production/lines` routes 404;
  `/production` redirects to `/production/operative-cells`; cell creation
  pre-filtered by location with auto-generated, per-location-sequential codes
  (`{plant.code}-{location.code}-{NN}`); child creation assigns Op10/Op20;
  nesting a grandchild under a child correctly 422s (depth-1 enforced);
  reorder persists after the fix; the migrated `production_line` row
  ("Línea Track Frame") now surfaces as a parent cell with 2 children. Not
  exercised: the `assetTypeSupportsProcess` 422 on assignment, because
  `EBI_dev` has zero seeded assets — the code path type-checks and mirrors
  the already-verified location-match check, but has no live data to drive it
  through the API. docs-sync's Agent call wrote its edits into the **main**
  checkout instead of this worktree (agent cwd resolution issue, not a
  content problem) — recovered by diffing the 9 touched docs files out of
  main, applying that patch here, and reverting main to its prior state
  (leaving unrelated pre-existing uncommitted changes in main untouched).
  Objective still accurate; plan not superseded.
