# ADR 0002 — Azure Blob Storage for maintenance asset documents

- **Status:** accepted (2026-07-01)
- **Plan:** 0004-mantenimiento (pruned: row in the [plans ledger](../../plans/README.md),
  full text in git history)

## Context

The Mantenimiento module attaches files to assets: manuals, electrical and
pneumatic diagrams, DXF top-views, photos (`maint.asset_document`). Files can
be large (PDFs, CAD); Azure SQL is priced and tuned for relational data, not
binary payloads, and the portal already runs against Azure services.

## Decision

- **File bytes live in Azure Blob Storage**, in a private container dedicated
  to maintenance documents. The database stores **metadata only** plus the
  container-relative key in `maint.asset_document.blob_path`.
- **Access is SAS-based.** The container has no public access; downloads go
  through short-lived (15 min) read-only SAS URLs generated server-side per
  request (`src/lib/storage/blob.ts`). Uploads are server-side through the API
  route — the browser never holds account credentials.
- **Configuration by env var name** (values in `.env` / Key Vault, never in
  the repo): `AZURE_STORAGE_CONNECTION_STRING`.
  *Amended 2026-07-06 (plan plant-layout-foundation):* container names are
  **code constants** (`BLOB_CONTAINERS` in `src/lib/storage/blob.ts`), not env
  vars — they are not secrets, and per-environment separation comes from the
  per-environment connection string. `AZURE_STORAGE_CONTAINER_MAINT` was
  removed.
- **Blob key convention:** `assets/{asset_id}/{timestamp}-{sanitized-filename}`.
  The DB row is the source of truth for the mapping; blobs are never
  enumerated to reconstruct state.
- **Soft-delete only** at the metadata layer (`is_active = 0`); blobs are kept
  until an explicit cleanup pass. `maint.plan_task.visual_aid_document_id` may
  reference a document, so hard deletes are deliberately not offered.

## Consequences

- DB backups stay small; file storage scales independently and cheaply.
- A DB restore without the matching container (or vice versa) leaves dangling
  references — environments must pair database + container (dev container for
  `EBI_dev`, prod container for `EBI`).
- SAS generation requires the account key in the connection string; if the
  portal later moves to managed identity, only `src/lib/storage/blob.ts`
  changes (user-delegation SAS), no schema or API impact.
