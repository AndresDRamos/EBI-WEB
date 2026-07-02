# maintenance

**Last synced:** 2026-07-01 · **Synced from:** plan 0004 (Fase A build)

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
- Owns blob upload/download for asset documents (`src/lib/storage/blob.ts`,
  ADR 0002): DB stores metadata + `blob_path`; bytes live in the private
  container; downloads are 302 redirects to 15-minute SAS URLs.
- Owns `/api/maintenance/assets/**` and `/api/maintenance/processes/**`
  (business-module APIs are namespaced by module). Reads require any
  authenticated user; mutations require `admin` (dedicated maintenance roles
  arrive with the mobile QR phase — "Plan 0004 Fase C").
- Owns the `(portal)/maintenance/*` UI: machines list (generic `DataTable`
  from `src/components/kit/`), machine detail (Datos / Procesos /
  Restricciones / Documentos tabs), process catalog, printable QR label.
- Does **not** own plants (module `org`, `auth.plant`) — assets reference
  them. Does not own users (`auth.app_user`) — document uploads and future
  work orders reference them.
- Restrictions are managed through dedicated sub-routes
  (`/api/maintenance/assets/[id]/restrictions[/...]`), not inside the asset
  PATCH payload (executor's choice per plan step 5).

## Dependency flow

- `(portal)/maintenance/*` pages → `src/modules/maintenance/db.ts` +
  `src/modules/org/db/org.ts` (plant options) + `src/lib/auth/rbac.ts`
  (`isAdmin` → `canManage` prop).
- `/api/maintenance/{assets,processes}/**` → `modules/maintenance/db.ts`;
  document routes also → `src/lib/storage/blob.ts` (Azure Blob).
- QR label page → `qrcode` (server-side data URL) → encodes
  `{NEXT_PUBLIC_APP_URL}/maintenance/machines/{code}` (falls back to the
  request origin when the env var is unset).
- `maint.asset.plant_id` → `auth.plant`; `maint.asset_document.uploaded_by` →
  `auth.app_user` (cross-schema queries resolved as separate per-schema
  queries merged in JS — a typed cross-schema join is not expressible with
  the flattened codegen keys).

## Related ADRs

- [ADR 0002 — Azure Blob Storage for maintenance asset documents](../architecture/adr/0002-azure-blob-asset-documents.md)

## Do not touch without reading

- **`maint.work_order.code` is a persisted computed column** (`WO-000001`
  folio). Never insert or update it; SQL Server computes it from the identity.
- **Enum values are CHECK constraints, not lookup tables.**
  `src/modules/maintenance/enums.ts` mirrors the CHECKs in V5/V6 — change them
  together (migration + module) or inserts start failing with 547.
- **`asset_document` rows are soft-delete only.** `plan_task
  .visual_aid_document_id` may reference them and the blob is kept until an
  explicit cleanup pass (ADR 0002); a hard DELETE either breaks the FK or
  orphans the blob silently.
- **`src/modules/maintenance/enums.ts` must stay a pure module** (no
  `server-only`, no I/O): it is imported by both client components and API
  validation.
