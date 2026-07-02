---
id: 0004-mantenimiento
status: committed         # draft -> approved -> built -> verified -> committed -> superseded
created: 2026-07-01
touches: [docs/modules/mantenimiento.md]
migrations: [V5__maint_asset_catalog.sql, V6__maint_plans_workorders_spares.sql]
supersedes: null
superseded_by: null
---

# Mantenimiento module — CMMS foundation + asset catalog (Fase A)

## Objective

Stand up the Mantenimiento module for the EBI portal as a proper CMMS
(computerized maintenance management system), designed from scratch for the
"deber ser" — **not** copied from the legacy EPS schema. This plan fixes the
complete data model (new `maint` schema, 13 tables, migrations V5 + V6) and
implements **Fase A only**: the full asset catalog UI (assets, processes,
restrictions, documents on Azure Blob Storage, printable QR label per asset).

Core design decisions (agreed with the user on 2026-07-01):

- **Work orders are the execution backbone.** Plans (preventive/autonomous)
  define *what and how often*; work orders record *what was done, by whom,
  when, consuming what*. The maintenance calendar is a **view over
  `work_order.scheduled_date`**, not a table. Corrective work = a WO without
  a plan (enforced by CHECK).
- **QR needs no schema.** `asset.code` is the QR payload: it encodes the
  portal URL `/assets/{code}` (authenticated, role-gated actions).
- **DXF plant map: store now, render later.** `asset_document.doc_type =
  'dxf_topview'` holds the file; the interactive plant map is a future phase.
- **Spare parts = catalog + append-only ledger** (`stock_movement`, signed
  quantities, current stock = SUM). No multi-warehouse/WMS in v1.
- **Calendar-based frequencies in v1**; `frequency_unit` CHECK is extensible
  to meter-based units (hours/cycles) without redesign.
- **Enumerations via named CHECK constraints**, not lookup tables (consistent
  with the repo: `auth.role` is a real entity, not an enum precedent).
- **WO folio `WO-000001` is a persisted computed column** (race-free,
  unique-indexed). User confirmed manual folios are not needed.
- File bytes live in **Azure Blob Storage**; the DB stores metadata +
  `blob_path` only. New infra decision → ADR to be written during build.

### Open phases (this plan = Fase A)

Later phases stay **open**, deliberately unnumbered — other plans run in
parallel and will take the next NNNN when they materialize. Refer to them as
"Plan 0004 Fase B", etc.

| Fase | Scope | Status |
|---|---|---|
| **A** | Migrations V5 + V6, asset catalog UI, documents, QR label | **this plan** |
| B | Preventive/autonomous plans + work orders + calendar UI | open |
| C | Mobile QR flow: execute maintenance from the floor, role-gated | open |
| D | Spare parts UI: kardex, min stock, WO consumption | open |
| E | ETL EPS→`maint` (clean legacy data) + interactive plant map | open |

## Steps

1. ~~Create `db/migrations/V5__maint_asset_catalog.sql` and
   `db/migrations/V6__maint_plans_workorders_spares.sql` from the `dba`
   sub-agent proposal~~ — done at plan-save (2026-07-01).
2. **Human gate:** run `flyway -configFiles=db/flyway.dev.conf migrate`
   against `EBI_dev`, verify clean `flyway info`, then `pnpm db:gen` to
   regenerate `src/lib/db/types.ts`. Do not proceed until types include the
   `maint` tables.
3. Create `src/lib/db/maint.ts`: bind `rootDb.withSchema("maint")` at the top
   (repo rule — kysely-codegen flattens schemas; without it SQL Server
   resolves under `dbo` and throws 208). Implement, following the
   `.output("inserted.<pk>").executeTakeFirst()` insert pattern:
   - Assets: `listAssets` (join plant name, filter by plant/status/is_active),
     `getAssetDetail` (asset + processes + restrictions + documents),
     `findAssetByCode` (QR lookup), `createAsset`, `updateAsset`,
     `softDeleteAsset` (`is_active = 0`), `setAssetProcesses` (replace M:N in
     one transaction — trx inherits the schema, do not re-bind).
   - Processes: `listProcesses`, `createProcess`, `updateProcess`,
     `softDeleteProcess`.
   - Restrictions: `listRestrictionsByAsset`, `createRestriction`,
     `updateRestriction`, `softDeleteRestriction`.
   - Documents: `listDocumentsByAsset`, `createDocument` (metadata row),
     `softDeleteDocument`.
4. Create `src/lib/storage/blob.ts`: Azure Blob Storage client
   (`@azure/storage-blob`), server-side upload + short-lived SAS URL for
   download. Env var **names** (values in `.env`, never committed):
   `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_MAINT`.
   Blob key convention: `assets/{asset_id}/{document_id}-{filename}`.
   Write `docs/architecture/adr/0002-azure-blob-asset-documents.md` (decision:
   blob storage for file bytes, DB metadata only, SAS-based access).
5. API routes (all behind the existing auth middleware; mutations gated with
   `requireAnyRole` — admin for now, maintenance roles arrive with Fase C):
   - `src/app/api/assets/route.ts` (GET list, POST create) and
     `src/app/api/assets/[id]/route.ts` (GET detail, PATCH, DELETE=soft).
   - `src/app/api/assets/[id]/documents/route.ts` (GET, POST multipart upload
     → blob + metadata row) and `.../documents/[docId]/route.ts` (GET SAS
     redirect, DELETE=soft).
   - `src/app/api/processes/route.ts` + `src/app/api/processes/[id]/route.ts`.
   - Restrictions handled inside the asset detail PATCH payload or
     `src/app/api/assets/[id]/restrictions/route.ts` — executor's choice,
     document it in the module doc.
6. UI — new top-level portal section (NOT under `/admin`; the global
   `PortalShell` rail gains a "maintenance" entry):
   - `src/app/(portal)/maintenance/machines/page.tsx` — asset list using the
     generic `DataTable` (`src/components/admin/data-table.tsx`) with columns
     code, name, brand/model, plant, criticality, status; filters per column.
   - `src/app/(portal)/maintenance/machines/[code]/page.tsx` — asset detail
     with tabs: Datos, Procesos, Restricciones, Documentos (upload/download),
     using `EntityFormDialog` for edit modals.
   - `src/app/(portal)/maintenance/process/page.tsx` — process catalog
     table page (same pattern as admin catalog pages).
7. Printable QR label: add `qrcode` (pnpm), route
   `src/app/(portal)/maintenance/machines/[code]/label/page.tsx` — QR
   encoding `{NEXT_PUBLIC_APP_URL}/maintenance/machines/{code}` + code +
   name, print-friendly CSS (EZI identity: #373a36 / #ff5c35, Montserrat).
8. Create `docs/modules/maintenance.md` from `docs/modules/_module-template.md`
   (purpose, responsibilities, dependency flow, link ADR 0002; "do not touch"
   entry: `work_order.code` is computed — never insert/update it).
9. Run `/sync-docs` (docs-sync sub-agent): new `docs/database/erd/maint.md`,
   `maint` entry in `docs/database/erd/_index.md`, data-dictionary update, and
   flip the V5/V6 rows in `docs/database/migrations-log.md` once applied.
10. Verify: `pnpm lint && pnpm build` pass; asset CRUD + document upload +
    QR label render checked in dev.

## Database impact

Reviewed by the `dba` sub-agent (2026-07-01). Full SQL in
`db/migrations/V5__maint_asset_catalog.sql` and
`db/migrations/V6__maint_plans_workorders_spares.sql`.

- **New schema `maint`, 13 tables.** V5: `process`, `asset` (self-FK
  hierarchy), `asset_process`, `asset_restriction`, `asset_document`.
  V6: `spare_part`, `maintenance_plan`, `plan_task`, `plan_material`,
  `work_order`, `work_order_task`, `work_order_material`, `stock_movement`.
- **Cross-schema FKs:** `asset.plant_id → auth.plant`; `uploaded_by`,
  `assigned_to`, `completed_by`, `done_by`, `moved_by → auth.app_user`.
- **Cascade policy:** cascade only header → own children (asset→process
  links/restrictions, plan→tasks/materials, WO→tasks/materials); NO ACTION
  toward catalogs, users, documents and history (WOs, stock ledger).
- **Irreversible operations: none** — all-new objects, no existing table
  touched. Caveat surfaced and accepted: `work_order.code` is a persisted
  computed column; switching to manual folios later would need a column-swap
  migration.
- **Indexes:** unique business keys (`asset.code`, `process.code`,
  `spare_part.code`, `work_order.code`); filtered covering indexes for the
  scheduler (`IX_maintenance_plan_due`), calendar (`IX_work_order_calendar`),
  open WOs (`IX_work_order_open`), and stock SUM/kardex
  (`IX_stock_movement_part`). Rationale table in the dba report inside the
  plan-session transcript; summary comments in the SQL headers.
- **Grants:** `ebi_app` CRUD + `ebi_agent_ro` SELECT on `SCHEMA::maint`,
  guarded (same pattern as V3).

## Amendments

<!-- Appended during /verify-plan, never edited into the sections above. -->

- 2026-07-01 — Phases B–E left as open, unnumbered phases of this plan (user
  works plans in parallel; future plans will reference "Plan 0004 Fase B",
  etc. and take whatever NNNN is next when created).
- 2026-07-01 — Plan 0005 (portal layout & navigation) replaces the static
  `PortalShell` rail with a DB-driven nav registry and lands **before** this
  plan's UI step. Step 6 no longer edits the global rail: V7
  (`db/migrations/V7__nav_registry.sql`) already seeds a `maintenance`
  section (`is_active = 0`); once this plan's routes exist, activate that
  section (label/icon/order already set) from the `/admin/access` screen
  instead. No change to steps 1–5 or 7–10.
- 2026-07-02 (/verify-plan) — **Verification could not complete; status kept
  at `built` (not advanced to `verified`).** Two findings, neither a defect in
  this plan's own code:
  1. **Shared build gate is red because plan 0005 is broken in the working
     tree.** `pnpm lint` fails with 3 `react-hooks` errors, and `pnpm build`
     fails to compile — every failure is in plan 0005 files
     (`src/lib/nav/pin-action.ts`, `src/components/nav/portal-sidebar.tsx`,
     `src/components/nav/portal-topbar.tsx`,
     `src/components/admin/nav-grants-panel.tsx`). Root build-breaker:
     `pin-action.ts` is a `"use server"` module that also exports a non-function
     constant (`SIDEBAR_PIN_COOKIE`), which Turbopack rejects ("module has no
     exports at all"), cascading through `portal-shell.tsx` →
     `(portal)/layout.tsx`. Plan 0004's own files compiled green in isolation
     earlier this session (before 0005 overwrote `portal-shell.tsx`); no maint/
     file appears in any error. The combined tree must build before 0004's
     UI can be exercised — that is 0005's verification scope, deliberately not
     fixed here.
  2. **Reachability gap confirmed.** `getNavForUser` (`src/lib/db/nav.ts`)
     selects only sections with `is_active = true` for *every* user, admins
     included. The seeded `maintenance` section is `is_active = 0`, so the
     module is currently unreachable from the topbar/sidebar for all users;
     only direct-URL navigation (`/maintenance/machines`) works. Activating the
     section from `/admin/access` (the new form of step 6) is what closes this
     — to be done once 0005 builds and the module is ready to expose. Not done
     now: the MCP is read-only and the admin UI that toggles it does not build.
  - No runtime/visual pass was possible (app does not build in the combined
    tree); `maint.asset` is also empty (0 rows), so the list would render its
    empty state regardless. No test suite exists in this project (`package.json`
    has only `lint`/`build`).
  - **Objective still holds** — the module is code-complete and correct; this
    is a blocked verification, not a superseded plan. Re-run `/verify-plan 0004`
    once plan 0005 builds green.
- 2026-07-02 (/verify-plan, re-run) — **Verified.** Plan 0005 is now
  `verified` (its `pin-action.ts` was split into `pin-cookie.ts`), so the
  shared-tree blocker is cleared. Results:
  - `pnpm lint && pnpm build` — **green** on the combined tree; all six
    `/maintenance/*` and `/api/{assets,processes}/*` routes compile and
    typecheck. The Kysely queries in `maint.ts` are typechecked against the
    live-schema-generated `types.ts`, so table/column/join validity is proven.
  - QR label runtime — verified with a standalone `qrcode` smoke test
    (produced a valid PNG data URL with the EZI colors), the one runtime path
    the build doesn't exercise.
  - **Full browser click-through was not performed.** The bootstrap-admin
    password is not stored anywhere (seed-time env var), so no headless login
    was possible, and the catalog is empty (`maint.asset` = 0 rows; 2 active
    plants, 0 processes). Build + typecheck + QR runtime cover the risk; a
    live click-through is deferred to the user once they log in and add data.
  - **Reachability — accepted as a deliberate dark launch, not a gap.** The
    seeded `maintenance` nav section is still `is_active = 0`, and
    `getNavForUser` shows only active sections, so the module is reachable only
    by direct URL for now. This is consistent with 0005's design (section
    visibility is data): the module ships hidden and is exposed with a
    one-click toggle in `/admin/access` (now a working, verified screen) when
    the user is ready. Not flipped here — it is a product/timing decision the
    user owns, and the MCP is read-only. **Action for the user:** activate the
    `Mantenimiento` section in `/admin/access` (and grant it to the intended
    roles) to make it appear in the rail.
