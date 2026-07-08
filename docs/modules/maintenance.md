# maintenance

**Last synced:** 2026-07-07 · **Synced from:** plan 0004 (Fase A build) + plan 0006 (RBAC actions pilot) + plan portal-home-nav-authz (nav items V9 + section guard) + plan production-cell-assignment (asset_category + Ubicación tab, V11) + plan org-schema-plant-process (process catalog moved to `org`, V15) + machines cards view (kit `EntityCard`, no schema change) + `design/Equipos.dc.html` fidelity pass (full-page layout, no schema change)

## Purpose

CMMS module of the EBI portal. Fase A ships the asset catalog: machines and
manufacturing equipment (`maint.asset`) with process links, operational/safety
restrictions, documents stored in Azure Blob Storage, and a printable QR label
per asset that deep-links to the asset's detail page. The full data model for
later phases (maintenance plans, work orders, spare parts) is already migrated
(V5 + V6) but has no UI yet — see plan 0004's open phases.

Since V15 the **process catalog itself is no longer owned here** — it moved to
the `org` schema (`org.process`) and is administered from the admin panel
(Organización group), not the maintenance module. Maintenance keeps only the
**asset↔process link** (`maint.asset_process`), gated by the existing
`maintenance.asset:update` permission (asset-process linking rides on it; there
is no dedicated `maintenance.process:*` permission — those were retired in V15).

## Responsibilities

- Owns the module slice `src/modules/maintenance/` — `db.ts` is the only
  place that queries `maint.*` tables; `components/` holds the module UI;
  `enums.ts` mirrors the schema CHECKs.
- Owns blob upload/download for asset documents (ADR 0002): DB stores
  metadata + `blob_path`; bytes live in the private `maintenance` container;
  downloads are 302 redirects to 15-minute SAS URLs. The blob helper
  (`src/lib/storage/blob.ts`) is **shared infra** since V13 (container as a
  parameter, names as code constants) — maintenance consumes it, not owns it.
- Owns `/api/maintenance/assets/**` (business-module APIs are namespaced by
  module). There is **no** `/api/maintenance/processes/**` anymore — the
  process CRUD moved to `/api/org/processes/**` under the `org` module in V15.
  Reads require any authenticated user; each mutation is gated by
  `requirePermission("maintenance.<resource>:<action>")` (plan 0006 — this
  module was the pilot; the `admin` profile bypasses at the app layer). The
  permission codes are seeded in V8; see `docs/modules/rbac.md`.
- Owns the `(portal)/maintenance/*` UI: machines list as a **full-page,
  unboxed cards catalog** (`machines-cards-page.tsx`, design source
  `design/Equipos.dc.html`) — `flex h-[calc(100vh-4rem)] flex-col` with three
  stacked regions (header+filters fixed, cards grid `flex-1 overflow-y-auto`,
  pagination fixed), no bordered card wrapper, matching the
  `layout-editor-page.tsx` full-page idiom. Header: breadcrumb, title, total
  active count, per-permission "Nuevo equipo". Filters row: kit
  `ActiveInactiveToggle`, a **Filtros pill** (funnel icon with an
  overlapping count badge, rotating chevron, controlled `Popover` — text
  search over code/name/brand/model/serial plus Planta and Tipo de equipo
  catalog checkboxes), inline **removable filter chips** grouping up to 3
  values per attribute (else "Sin filtros activos"), and on the far right a
  "Limpiar" action + live result count. Cards paginate client-side
  (`PAGE_SIZE = 24`, prev/next + numbered buttons with ellipsis) with a
  design-matching empty state ("No se encontraron equipos" + "Limpiar
  filtros") when filters yield zero rows. Editar / Desactivar / Reactivar
  live in a **right-click context menu** per card (shadcn `ContextMenu`),
  each item gated by its permission, Desactivar confirmed via `AlertDialog`
  and Reactivar direct (reversible). Menu actions defer to the next tick
  before opening dialogs — opening one synchronously from `onSelect` races
  the Radix menu close and strands `pointer-events: none` on the body,
  freezing the page). The cards are `machine-cards.tsx` (`MachineCardsGrid`),
  which maps rows onto the **generic kit `EntityCard`/`EntityCardGrid`**
  (`src/components/kit/entity-card.tsx`, design source: the "Equipos" card
  in the Claude Design project, `design/Equipos.dc.html`): a mono code chip,
  a **fixed "Sin conexión" status dot until asset telemetry exists**, name,
  brand/model/serial details, an asset-category badge, and a location footer
  with the plant and the current production cells (`cell_names: string[]` on
  `MachineRow`, "Sin celda asignada" when empty). `StatusBadge` /
  `CriticalityBadge` live in `machine-badges.tsx` (shared with the detail).
  Machine detail (Datos / Procesos / Restricciones / Documentos /
  Ubicación tabs), printable QR label. There is **no** `/maintenance/process`
  page anymore — the process catalog page (and its `Procesos` nav item, V9)
  were retired in V15; the machine-detail Procesos tab still links/saves the
  asset↔process assignment (picking from `org.process`), and its "create them"
  link now points to `/admin/organization/processes`. The **Ubicación tab is
  read-only**: it shows the asset's current cell assignments + history read
  from `production/db.listHistoryByAsset`; all assignment actions live in the
  production cell detail. The segment `layout.tsx` gates the whole tree with
  `requireSectionOrRedirect("maintenance")` (page authz by section grant, ADR
  0005); the `Máquinas` nav item is seeded by V9.
- `maint.asset.asset_category` (`production_equipment` | `material_handling`,
  added V11): the machine form exposes an **explicit required select** —
  data loading must not rely on the DB default, which only suits manufacturing
  machinery (the catalog was empty at migration time, verified by
  data-analyst 2026-07-03). The `location` free-text column still exists (and
  shows in Datos) until a future decision; the source of truth for physical
  location is now `production.asset_cell_assignment`.
- Does **not** own plants (module `org`, `org.plant` since V15) nor the process
  catalog (module `org`, `org.process` since V15) — assets and `asset_process`
  reference them cross-schema. Does not own users (`auth.app_user`) — document
  uploads and future work orders reference them. Does not own
  lines/cells/assignments (module `production`, schema `production` since V12) —
  it only reads them for display.
- Restrictions are managed through dedicated sub-routes
  (`/api/maintenance/assets/[id]/restrictions[/...]`), not inside the asset
  PATCH payload (executor's choice per plan step 5).

## Dependency flow

- `(portal)/maintenance/*` pages → `src/modules/maintenance/db.ts` +
  `src/modules/org/db/org.ts` (plant options); the machines list page also →
  `modules/production/db.currentCellNamesByAssets` (batched current cell
  names for the cards footer — app-layer composition). Pages no longer compute a
  `canManage`/`isAdmin` prop: action visibility is gated client-side by
  `useCan()` from `PermissionsProvider` (seeded in `(portal)/layout.tsx`);
  the API re-checks with `requirePermission` per request.
- `/api/maintenance/assets/**` → `modules/maintenance/db.ts`; document routes
  also → `src/lib/storage/blob.ts` (Azure Blob). (Process CRUD is
  `/api/org/processes/**` → `modules/org/db/processes.ts` since V15;
  `maintenance/db.ts` keeps only thin `org`-bound reads `listProcesses` /
  `findProcessById`, re-exported from `modules/org/db/processes`, for the
  machine-detail picker.)
- QR label page → `qrcode` (server-side data URL) → encodes
  `{NEXT_PUBLIC_APP_URL}/maintenance/machines/{code}` (falls back to the
  request origin when the env var is unset).
- `maint.asset.plant_id` → `org.plant` (since V15); `maint.asset_process
  .process_id` → `org.process` (since V15); `maint.asset_document.uploaded_by`
  → `auth.app_user` (cross-schema queries resolved as separate per-schema
  queries merged in JS — a typed cross-schema join is not expressible with the
  flattened codegen keys; the process-name join in `listAssets` /
  `getAssetDetail` now resolves via an `org`-bound query, same technique as
  `plantNamesById`).
- **maintenance → production (one-way, justified):**
  `modules/maintenance/enums.ts` re-exports the canonical asset-category
  domain from `modules/production/enums.ts` (V11 owns the CHECK), the
  machine detail page (`(portal)/maintenance/machines/[code]/page.tsx`) reads
  `listHistoryByAsset` from `modules/production/db.ts` for the Ubicación tab,
  and the machines list page (`(portal)/maintenance/machines/page.tsx`) reads
  `currentCellNamesByAssets` from the same file for the cards view.
  Nothing in `src/modules/production/` imports from
  `src/modules/maintenance/` (only app routes compose both).

## Related ADRs

- [ADR 0002 — Azure Blob Storage for maintenance asset documents](../architecture/adr/0002-azure-blob-asset-documents.md)

## Do not touch without reading

- **`maint.work_order.code` is a persisted computed column** (`WO-000001`
  folio). Never insert or update it; SQL Server computes it from the identity.
- **Enum values are CHECK constraints, not lookup tables.**
  `src/modules/maintenance/enums.ts` mirrors the CHECKs in V5/V6 — change them
  together (migration + module) or inserts start failing with 547. The
  `asset_category` domain is **not defined here**: it is re-exported from
  `src/modules/production/enums.ts` (V11 owns that CHECK) — edit it there.
- **`asset_document` rows are soft-delete only.** `plan_task
  .visual_aid_document_id` may reference them and the blob is kept until an
  explicit cleanup pass (ADR 0002); a hard DELETE either breaks the FK or
  orphans the blob silently.
- **`src/modules/maintenance/enums.ts` must stay a pure module** (no
  `server-only`, no I/O): it is imported by both client components and API
  validation.
