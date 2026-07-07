# maintenance

**Last synced:** 2026-07-03 · **Synced from:** plan 0004 (Fase A build) + plan 0006 (RBAC actions pilot) + plan portal-home-nav-authz (nav items V9 + section guard) + plan production-cell-assignment (asset_category + Ubicación tab, V11)

## Purpose

CMMS module of the EBI portal. Fase A ships the asset catalog: machines and
manufacturing equipment (`maint.asset`) with processes, operational/safety
restrictions, documents stored in Azure Blob Storage, and a printable QR label
per asset that deep-links to the asset's detail page. The full data model for
later phases (maintenance plans, work orders, spare parts) is already migrated
(V5 + V6) but has no UI yet — see plan 0004's open phases.

## Responsibilities

- Owns the module slice `src/modules/maintenance/` — `db.ts` is the only
  place that queries `maint.*` tables; `components/` holds the module UI;
  `enums.ts` mirrors the schema CHECKs.
- Owns blob upload/download for asset documents (ADR 0002): DB stores
  metadata + `blob_path`; bytes live in the private `maintenance` container;
  downloads are 302 redirects to 15-minute SAS URLs. The blob helper
  (`src/lib/storage/blob.ts`) is **shared infra** since V13 (container as a
  parameter, names as code constants) — maintenance consumes it, not owns it.
- Owns `/api/maintenance/assets/**` and `/api/maintenance/processes/**`
  (business-module APIs are namespaced by module). Reads require any
  authenticated user; each mutation is gated by
  `requirePermission("maintenance.<resource>:<action>")` (plan 0006 — this
  module was the pilot; the `admin` profile bypasses at the app layer). The
  permission codes are seeded in V8; see `docs/modules/rbac.md`.
- Owns the `(portal)/maintenance/*` UI: machines list (generic `DataTable`
  from `src/components/kit/`, with a Categoría column + catalog filter since
  V11), machine detail (Datos / Procesos / Restricciones / Documentos /
  Ubicación tabs), process catalog, printable QR label. The **Ubicación tab is
  read-only**: it shows the asset's current cell assignments + history read
  from `production/db.listHistoryByAsset`; all assignment actions live in the
  production cell detail. The
  segment `layout.tsx` gates the whole tree with
  `requireSectionOrRedirect("maintenance")` (page authz by section grant, ADR
  0005); the `Máquinas`/`Procesos` nav items are seeded by V9.
- `maint.asset.asset_category` (`production_equipment` | `material_handling`,
  added V11): the machine form exposes an **explicit required select** —
  data loading must not rely on the DB default, which only suits manufacturing
  machinery (the catalog was empty at migration time, verified by
  data-analyst 2026-07-03). The `location` free-text column still exists (and
  shows in Datos) until a future decision; the source of truth for physical
  location is now `production.asset_cell_assignment`.
- Does **not** own plants (module `org`, `auth.plant`) — assets reference
  them. Does not own users (`auth.app_user`) — document uploads and future
  work orders reference them. Does not own lines/cells/assignments (module
  `production`, schema `production` since V12) — it only reads them for display.
- Restrictions are managed through dedicated sub-routes
  (`/api/maintenance/assets/[id]/restrictions[/...]`), not inside the asset
  PATCH payload (executor's choice per plan step 5).

## Dependency flow

- `(portal)/maintenance/*` pages → `src/modules/maintenance/db.ts` +
  `src/modules/org/db/org.ts` (plant options). Pages no longer compute a
  `canManage`/`isAdmin` prop: action visibility is gated client-side by
  `useCan()` from `PermissionsProvider` (seeded in `(portal)/layout.tsx`);
  the API re-checks with `requirePermission` per request.
- `/api/maintenance/{assets,processes}/**` → `modules/maintenance/db.ts`;
  document routes also → `src/lib/storage/blob.ts` (Azure Blob).
- QR label page → `qrcode` (server-side data URL) → encodes
  `{NEXT_PUBLIC_APP_URL}/maintenance/machines/{code}` (falls back to the
  request origin when the env var is unset).
- `maint.asset.plant_id` → `auth.plant`; `maint.asset_document.uploaded_by` →
  `auth.app_user` (cross-schema queries resolved as separate per-schema
  queries merged in JS — a typed cross-schema join is not expressible with
  the flattened codegen keys).
- **maintenance → production (one-way, justified):**
  `modules/maintenance/enums.ts` re-exports the canonical asset-category
  domain from `modules/production/enums.ts` (V11 owns the CHECK), and the
  machine detail page (`(portal)/maintenance/machines/[code]/page.tsx`) reads
  `listHistoryByAsset` from `modules/production/db.ts` for the Ubicación tab.
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
