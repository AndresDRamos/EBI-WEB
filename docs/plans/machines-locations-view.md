---
id: machines-locations-view
status: committed
created: 2026-07-08
touches: [maintenance, production, org (admin CRUD), navigation (none)]
migrations: [V18]
supersedes: null
superseded_by: null
---

# Machines view — locations, type-level processes, modal redesign

## Objective

Rework the maintenance equipment view around physical **locations**: each plant
owns configurable `org.location` rows (production bays, warehouses…), an asset
lives in exactly one location (plant is derived), and a production cell can
only be assigned to an asset when both share the location. Processes stop
being assigned per asset and become an attribute of the **asset type**
(N:M in DB, 1:1 in the UI), and the matrícula prefix moves from category to
type. The equipment detail modal is redesigned (large image, ubicación row,
Mantenimiento/Documentación/Restricciones tabs, icon-only actions), QR label
printing happens in-modal without navigation, and scanning a QR lands on a
layout-less page rendering the same detail surface.

**Adoption note:** migration V18 (`org locations type processes`) was applied
to `EBI_dev` on 2026-07-08 by a session that died before persisting anything.
This plan adopts it: the `dba` sub-agent reconstructed the SQL faithful to the
live schema, the file is registered and `flyway repair` realigns the checksum.
The destructive cleanup (all `maint.asset` rows + dependents) already happened
in that session.

## Steps

1. Materialize `db/migrations/V18__org_locations_type_processes.sql`
   (dba reconstruction), register it in `docs/database/migrations-log.md`
   (`applied: true`, adopted-from-live), run `flyway repair` + verify
   `flyway info` clean, `pnpm db:gen`.
2. `org` module: `db/locations.ts` (list by plant, CRUD, 409 on FK) +
   `/api/org/locations[/[id]]` gated by `org.location:*`; admin
   plants page becomes a `GroupedDataTable` Planta → Ubicaciones.
3. `production` module: cells CRUD gains `location_id` (nullable select of
   the plant's locations); db helpers `listCellsByLocation`,
   `assignAssetToCell` / `closeAssetCellAssignment` reachable from the
   machine modal via a namespaced API (`production.assignment:*` perms).
4. `maintenance/db.ts` rework: type CRUD carries `code_prefix` +
   `process_id` (1:1 UI over `asset_type_process`); category CRUD loses
   the prefix; `listAssets`/`getAssetDetail` resolve location (+plant) and
   type-derived processes; `createAsset(location_id)` claims the
   (type, plant) sequence; `updateAsset` accepts `location_id` and rejects
   `plant_id`/`status`; asset-level `setAssetProcesses` removed.
5. APIs updated accordingly (`/api/maintenance/assets*`,
   `/api/maintenance/asset-types*`); POST/PATCH validate the cell↔location
   invariant server-side (422).
6. Catalogs tab UI: type dialog gains Prefijo + Proceso select; category
   dialog drops Prefijo; GroupedDataTable columns updated.
7. Machine modal redesign (user-provided mock): large image left; name /
   brand / model / serial / category / type right; Ubicación row (planta ·
   location · celda — cell options filtered by the asset's location, empty
   state when the location has no cells); status not rendered nor editable;
   header actions icon-only (QR, trash, pencil).
8. Tabs become Mantenimiento (two representative buttons: Mantenimiento
   preventivo / Mantenimiento autónomo — placeholders for the next phase),
   Documentación (existing documents CRUD), Restricciones (unchanged).
   Procesos and Ubicación tabs retired.
9. QR: in-modal print (hidden iframe on the printable label, no navigation);
   QR payload switches to a layout-less authenticated page
   (`/asset/[code]`) that renders the same summary + tabs; the old
   `/maintenance/machines/[code]` shim stays for already-printed labels.
10. Cards page: footer shows location (+plant) and current cells; filters
    keep working over the new shape.
11. `docs-sync`, then verify: `pnpm lint && pnpm build`, visual pass with
    the dev server left running for the user's manual tests. **No test
    entities are created — the user seeds and tests himself.**

## Database impact

Adopted, already applied (V18, reconstructed by the `dba` sub-agent):

- New `org.location` (FK plant, `UQ_location_plant_code`) + 3 permission
  seeds `org.location:{create,update,delete}`.
- New `maint.asset_type_process` (type ↔ `org.process`, N:M) replacing
  `maint.asset_process` (dropped).
- `maint.asset_type.code_prefix` (UNIQUE) — moved from `asset_category`
  (column + unique dropped there).
- `maint.asset_code_sequence` re-keyed to (asset_type_id, plant_id).
- `maint.asset`: `plant_id` dropped, `location_id` NOT NULL added
  (`FK_asset_location`, `IX_asset_location`).
- `production.cell.location_id` NULL added (`FK_cell_location`,
  filtered `IX_cell_location`).
- Irreversible (already executed by the dead session): DELETE of all
  `maint.asset` rows and dependents (restrictions, documents, cell
  assignments, footprints, placements, code sequences); drop of
  `asset.plant_id` and `asset_category.code_prefix`.

## Amendments

- 2026-07-08 — **V18 adopted-from-live.** A previous session applied V18 to
  `EBI_dev` (2026-07-08 23:29) and died without committing anything. The SQL
  was reconstructed from live introspection by the `dba` sub-agent and the
  checksum realigned via `flyway repair` (clean `flyway info`, v18 Success).
  The destructive purge had already run in that session.
- 2026-07-08 — `listAssets` filter changed `plantId` → `locationId` (plant is
  derived); `test/layout/edit` now filters assets by derived plant in JS; the
  placements API validates plant via `asset.location_id → org.location`.
- 2026-07-08 — Moving an asset to another location auto-closes its current
  cell assignments in the PATCH route (historized close, rides on
  `maintenance.asset:update`); the cell picker in the modal syncs via the
  production assignment APIs and is gated by `production.assignment:*`.
- 2026-07-08 — `machine-badges.tsx` (StatusBadge/CriticalityBadge) and the
  flat `plants-table-page.tsx` were deleted (status is no longer rendered
  anywhere per the ask; plants admin is now grouped with locations).
- 2026-07-08 — Ops note: a zombie `next dev` from the dead session was still
  listening on :3001 (killed); the Claude Preview launcher always runs from
  the MAIN checkout, so `.claude/launch.json` (main) gained a temporary
  `ebi-web-dev-worktree` config (`pnpm -C .claude/worktrees/...`) — remove or
  keep at commit time.
- 2026-07-09 — **User feedback pass.** (1) Fixed: the create-mode "Cancelar"
  button was a no-op — `ExpandingModal`'s `requestClose` guards on
  `closeDisabled` (bound to `editing`, which starts `true` on create), so an
  explicit Cancelar click needs to bypass that guard; added
  `requestCloseForce` to the modal's context, used only by the Cancelar
  handler (backdrop/Escape stay guarded). (2) Redesigned the summary panel:
  Categoría → Tipo de equipo and Planta → Ubicación → Celda are now cascading
  selects (each step filters/reveals the next, `animate-in` slide+fade) —
  `plants` was threaded as a new prop (`MachineModal`/`MachinesCardsPage`/
  `MachineStandaloneView`/both pages) so the Planta step lists every plant,
  not only ones that already have a location (an actual gap: without it, a
  freshly created plant would never appear until it had a location, since the
  step was previously derived from `locations` alone). Fecha de instalación,
  Equipo padre and Notas moved into a bottom "Detalles" section behind a
  divider; `ParentSearchPanel` restyled from a sidebar (`border-l`) to an
  inline card since it now sits under the Detalles grid, not beside the
  identity column. Verified end-to-end in the preview: Cancelar closes on
  create, Categoría reveals Tipo, Planta reveals Ubicación (shows "Sin
  ubicaciones en esta planta" correctly against the current empty-locations
  data). `pnpm lint && pnpm build` clean (had to stop the dev server first —
  a concurrent `next dev` on the same `.next` corrupts the build's generated
  route-type validator; unrelated to app code, just a shared-`.next` hazard
  worth remembering for future worktree previews).
- 2026-07-09 — **Second feedback pass.** (1) Uniform control heights: the
  "Buscar equipo padre" button was `size="sm"` (h-8) next to h-9
  inputs/selects — normalized to the default size; verified via computed
  `getBoundingClientRect().height` in the preview that every form input,
  select and button in the modal is 36px (only the 224px photo picker and the
  32px header back-nav icon differ, both intentionally). (2) Removed the
  blank-space-below-divider: the `<hr>` between the summary panel and the
  tabs only makes sense when tabs render, but it rendered unconditionally —
  in create mode (no tabs) it left a divider over empty space. Now wrapped in
  `{!isCreate ? ... : null}`. (3) Detalles reflow: Fecha de instalación +
  Equipo padre now share a 2-column row; Notas moved to its own full-width
  row below with `rows={2}` (was `rows={3}` squeezed into a 1/3 column) —
  wider, shorter, per the ask. (4) Equipo padre search replaced entirely:
  the old inline `ParentSearchPanel` (revealed below the Detalles grid) is
  gone; "Buscar equipo padre" now opens `ParentPickerModal` (new file,
  `parent-picker-modal.tsx`), a `QrModal`-style dialog stacked over the
  equipment modal with a search list on the left and a compact **read-only**
  preview on the right (photo, name, code, categoría/tipo badges, marca/
  modelo/serie, planta/ubicación/celda) — no edit affordances, no tabs, no
  Detalles section, matching "una vista del mismo modal del equipo pero sin
  poder editarse y más compacta". `ParentOption` gained `category_name`/
  `location_name`/`cell_names` to feed that preview; threaded through both
  call sites (`machines-cards-page.tsx` from `MachineRow`, `asset/[code]
  /page.tsx` — had to widen its `currentCellNamesByAssets` call from just the
  current asset to all assets, since every active asset is a parent
  candidate). `machine-form-dialog.tsx` is now pure type exports (dropped
  `"use client"` and the now-dead `ParentSearchPanel`/`ReadOnlyField`/their
  imports). Verified in preview: picker opens stacked over the create-mode
  equipment modal, search/list/preview panes render correctly (empty-state
  correct against the current no-assets data); `pnpm lint`, `tsc --noEmit`
  and `pnpm build` all clean (dev server stopped first, same `.next`-sharing
  caveat as the prior pass).
- 2026-07-09 — **Third feedback pass (cards page header).** Matched the
  generic kit `DataTable`'s own header pattern instead of inventing a new
  one: `ActiveInactiveToggle` moved out of the filters row and into the
  header, immediately beside the "Nuevo equipo" button (was a separate pill
  below, disconnected from the add action). The add button itself changed
  `size="sm"` + custom `w-8` (32px) → `size="icon"` (h-9/36px, the same
  variant `DataTable`'s own Add button uses), closing the last height
  mismatch in this view. Title copy: `<h1>` "Equipos" → "Listado de
  equipos" — the `PageTabs` tab label stays "Equipos" (only the page
  heading changed, as asked). Verified in preview. `pnpm lint`, `tsc
  --noEmit` and `pnpm build` clean (dev server stopped first, same
  `.next`-sharing caveat).
- 2026-07-09 — **Fourth feedback pass.** (1) `ActiveInactiveToggle`
  (`src/components/kit/data-table.tsx`) still rendered at ~30px against the
  36px `size="icon"` Add button beside it — fixed at the shared component
  (`h-9` wrapper + `h-full` inner tab buttons instead of `py-1` padding for
  height), so every kit-table pairing of the toggle with an add button
  (Plantas y ubicaciones, Departamentos y roles, Catálogos, Equipos, …)
  gets the same 36px alignment, not just this page. (2) Renamed the second
  machines tab "Catálogos" → "Tipos de equipo" (`machines-tabs.ts`) and its
  `GroupedDataTable` title "Catálogos de equipo" → "Categorías y tipos de
  equipo" (`machine-catalogs-page.tsx`) — UI copy only, route path
  (`/maintenance/machines/catalogs`) and JSDoc comments left as-is (no
  functional change). Verified in preview (toggle/add button now flush at
  36px; tab + header show the new copy). `tsc --noEmit` and `pnpm lint`
  clean; `pnpm build` clean (dev server stopped first for the `.next`-share
  caveat, `rm -rf .next` skipped this round — a lingering file handle from
  the just-stopped server blocked the removal, but a plain `pnpm build`
  without deleting `.next` first was equally clean here since no dev server
  was running concurrently).
