# planning

**Last synced:** 2026-07-14 · **Synced from:** plan laser-cut-sequencing
(branch `feat/laser-cut-sequencing`, migration V20)

## Purpose

Planning module of the EBI portal. Its first feature is **laser-cut
sequencing** (Plant 1 / EPS route 9 "Corte Láser"): a planner sees the open
nesting backlog landed from EPS and builds an ordered **sequence program** per
laser cell for a given date, moving from `draft` → `published`. The module owns
the portal-side `planning` schema (sequence programs + the EBI cell ↔ EPS
station mapping) and **reads** the ETL-landed `staging.eps_*` replica; it never
writes `staging` (that is the on-prem ETL's job). The whole module is
parameterized by `(plant, route)` but ships with a single hard-coded scope
(`SCOPE = { plantId: 1, routeId: 9, processCode: "CL" }`).

The `planning` nav section ships **dark** (V20 `is_active = 0`); the pages are
granted to planner roles after activation.

## Responsibilities

- Owns the module slice `src/modules/planning/`:
  - `db/` — one file per aggregate (barrel `db/index.ts`, same convention as
    `org`/`production`):
    - `shared.ts` — re-binds the domain-blind per-schema clients
      (`planningDb`, `stagingDb`, `etlDb`, `orgDb` from
      `src/lib/db/schema-clients.ts`) under module-local names; the `SCOPE`
      constant, `SETUP_MINUTES = 15` (flat per-nesting setup allowance; v1 does
      **not** model finite capacity), and `laserProcessId()` (resolves the
      `org.process` id for code `CL`).
    - `nesting.ts` — **read-only** layer over `staging.*`: `listOpenNestings`,
      `listNestingComponents`, `routeStepsByPart`, `cuttingStationRefs`,
      `etlFreshness`, and the composed `getLaserBacklog` payload. **Unit
      heterogeneity is resolved here** (`cut_minutes` is minutes;
      `process_seconds`/`setup_seconds` are seconds), never in staging.
    - `program.ts` — sequence-program CRUD (`planning` schema, portal-owned):
      `getProgramDetail`, `getDatePrograms`, `ensureDraftProgram`, `addEntry`,
      `removeEntry`, `reorderEntries`, `updateProgram`, `publishProgram`,
      `deleteProgram`, plus the pure unit-tested `reorderPasses` helper and
      typed errors (`ProgramNotFoundError`, `ProgramNotDraftError`,
      `NestingNotOpenError`, `EntryExistsError`, `EntrySetMismatchError`).
      Entries reference `staging.eps_nesting` **logically** (no FK) → existence
      is validated at `addEntry`.
    - `station-link.ts` — EBI cell ↔ EPS laser-station mapping
      (`listStationMappings`, `listSequencingCells`, `linkStationToCell`,
      `unlinkStation`) with typed errors (`CellAlreadyLinkedError`,
      `StationAlreadyLinkedError`, `CellNotAssignableError`,
      `LinkNotFoundError`). Reads span three schemas (`staging` stations,
      `planning` links, `production` cells) merged in JS — a typed cross-schema
      join is not expressible with the flattened codegen keys; the sizes
      (~9 stations, ~2 cells) make it a non-issue.
  - `schemas.ts` — Zod request schemas for `/api/planning/*`
    (`createProgramSchema`, `updateProgramSchema`, `addEntrySchema`,
    `reorderEntriesSchema`, `linkStationSchema`) + the `YYYY-MM-DD` →
    UTC-midnight `Date` parser.
  - `format.ts` — **client-safe** formatters (no `server-only`): `entryMinutes`
    / `formatMinutes` / `secondsToMinLabel`, the `materialStatus` badge
    derivation + `MATERIAL_STATUS_META` / `PROGRAM_STATUS_META`, `dateLabel`,
    and `computeStaleWarning` (ETL staleness heuristic, takes an explicit
    `nowMs` so it can run server-side). `SETUP_MINUTES` is duplicated here
    (the db module is `server-only`).
  - `components/` — module UI (all `"use client"`):
    `laser-sequencing-page.tsx` (`LaserSequencingPage`, orchestrator; action
    visibility via `useCan`), `machine-timeline.tsx`, `machine-detail-panel.tsx`,
    `nesting-backlog.tsx`, and `migrations-page.tsx` (the Admin → Migraciones
    mapping table).
  - `hooks/use-program-editor.ts` — client state machine for the sequencing
    page (fetches each date's programs via the API through `apiMutate`).
  - `__tests__/` — vitest unit tests (`reorder.test.ts`, `schemas.test.ts`).
- Owns `/api/planning/**`. Reads require any authenticated user
  (`requireUser`); mutations are gated by `requirePermission`:
  - `GET /nestings` (`requireUser`) — the open-nesting backlog payload.
  - `GET /programs` (`requireUser`) / `POST /programs`
    (`planning.program:create`) — list a date's programs / create-or-ensure a
    draft.
  - `GET /programs/[id]` (`requireUser`), `PATCH /programs/[id]`
    (`planning.program:update` — notes, or the `draft → published` publish
    transition), `DELETE /programs/[id]` (`planning.program:delete` — drafts
    only).
  - `POST /programs/[id]/entries` (`planning.program:update`) — append a
    nesting; `DELETE /programs/[id]/entries/[nestingId]`
    (`planning.program:update`) — remove one; `POST
    /programs/[id]/entries/reorder` (`planning.program:update`) — persist a new
    order.
  - `GET /station-links` (`requireUser`), `POST /station-links`
    (`planning.station_link:manage`), `DELETE /station-links/[id]`
    (`planning.station_link:manage`).
- Owns the `(portal)/planning/*` UI. `/planning` redirects to
  `/planning/laser-sequencing`; the segment `layout.tsx` gates the tree with
  `requireSectionOrRedirect("planning")` (per-page nav authz, ADR 0008). The
  sequencing page RSC loads `getLaserBacklog` + `listSequencingCells`
  server-side and hands them to `LaserSequencingPage`.
- Supplies the **Admin → Migraciones** page (`(portal)/admin/migrations`,
  admin-only via the parent `admin/layout.tsx`) which renders
  `MigrationsPage` over `listStationMappings()`. Its rail item (`Migraciones`
  → `/admin/migrations`, icon `Map`) is a **code-built** entry in
  `ADMIN_NAV_SECTION` (`src/modules/navigation/admin-nav.ts`), not a seeded
  `nav_item` — same mechanism as the rest of the admin rail.
- Does **not** own the EPS landing. The `staging.eps_*` tables are written
  exclusively by the on-prem ETL (`etl/`, see below); the module only reads
  them. It also does not own `production.cell` (referenced by
  `cell_station_link` / `machine_program`) or `auth.app_user`
  (`machine_program.created_by`).

## The on-prem ETL (`etl/`)

- A standalone Node script (`etl/run.mjs` + pure helpers in
  `etl/lib/transform.mjs`) that runs **on the plant LAN** — the Next.js portal
  cannot reach EPS (`192.168.4.5`), so this is the only bridge. **READ-ONLY on
  EPS** (hard rule #3): it only `SELECT`s from EPS and writes to EBI as the
  least-privileged `ebi_etl` login (CRUD on `staging`, INSERT/UPDATE on
  `etl.run_log`; no DELETE on the log — it's a bitácora).
- Each run lands the laser-cut domain (Plant 1 / route 9) into the five
  `staging.eps_*` tables and writes one `etl.run_log` row per entity (`entity`
  ∈ `eps_nesting`, `eps_nesting_detail`, `eps_nesting_plan`,
  `eps_cutting_station`, `eps_part_route_step`). `eps_nesting` /
  `eps_nesting_detail` use a `row_hash` MERGE (a second immediate run writes ~0
  rows); the **first run** loads the open window only (no closures backfill) so
  it never pulls the ~285k historic nestings.
- Runs via `pnpm etl:run` (`node --env-file=.env etl/run.mjs`); suggested
  cadence every 15 min via Windows Task Scheduler. Config is env-only
  (`EPS_SQL_*`, `EBI_ETL_*` — secrets in `.env`, never the repo). Pure
  transform helpers are unit-tested via vitest (`vitest.config.ts` includes
  `etl/**/*.test.mjs`). Full runbook: `etl/README.md`.
- `ebi_etl` must be **created by a human before V20 runs** in each database
  (done in `EBI_dev` 2026-07-14; required in `EBI` before the production
  migration).

## Dependency flow

- `(portal)/planning/laser-sequencing/page.tsx` → `modules/planning/db`
  (`getLaserBacklog`, `listSequencingCells`) + `modules/planning/format`
  (`computeStaleWarning`).
- `(portal)/admin/migrations/page.tsx` → `modules/planning/db`
  (`listStationMappings`) + `modules/planning/components/migrations-page`.
- `/api/planning/**` → `modules/planning/db` (barrel) +
  `modules/planning/schemas` (Zod) + `@/lib/auth/rbac`
  (`requireUser`/`requirePermission`).
- `modules/planning/db/*` → `planning.*` (CRUD) via `planningDb`; **reads**
  `staging.*` via `stagingDb`, `etl.run_log` via `etlDb`, `production.cell` via
  `productionDb`, and `org.process` via `orgDb` — all from
  `src/lib/db/schema-clients.ts`, merged in JS (no typed cross-schema joins).
- `etl/run.mjs` → EPS SQL Server (read-only, `tedious`) → EBI `staging.*` +
  `etl.run_log` (as `ebi_etl`). Completely out-of-process from the portal; the
  only coupling is the `staging`/`etl` table contract.

## Related ADRs

- [ADR 0004 — Role as access profile](../architecture/adr/0004-role-as-access-profile.md) (admin bypass; no `role_permission` seeds)
- [ADR 0008 — Page grants authorize pages](../architecture/adr/0008-page-grants-authorize-pages.md) (per-page segment guard for `/planning/*`)

## Do not touch without reading

- **`staging.*` is ETL-owned; the portal reads it, never writes.** Nothing in
  `src/modules/planning/` may `INSERT`/`UPDATE`/`DELETE` `staging`. `ebi_app`
  holds only SELECT on `staging` — a write would fail at the DB anyway, but do
  not design one.
- **`machine_program_entry.eps_nesting_id` has NO FK to `staging.eps_nesting`
  — by design** (staging must stay re-baselinable). Existence is validated in
  the app at `addEntry`; do not add a DB FK or you break the ETL re-baseline
  runbook (`etl/README.md`).
- **Entry reorder is a positive-offset two-pass update** (`reorderPasses`):
  `CK_machine_program_entry_sequence` forbids `sequence_no ≤ 0`, so the temp
  pass uses `seq + 1_000_000` (never negative temps) to dodge
  `UQ_machine_program_entry_sequence` mid-update. Do not collapse it into one
  pass.
- **Publishing is transactional and single-slot.** `publishProgram` archives
  the previously published program for the same `(cell, date, shift)` before
  flipping the draft, honoring `UQ_machine_program_published` (filtered on
  `status = 'published'`). NULL `shift` = whole-day, unique per cell/date
  (SQL Server treats NULLs as equal in a unique index). Keep both moves in one
  transaction.
- **Units stay heterogeneous in `staging` on purpose** — convert only in
  `db/nesting.ts` (minutes vs seconds). Never "normalize" units in the ETL or
  the landing tables.
- **`SETUP_MINUTES = 15` is duplicated** in `db/shared.ts` (server) and
  `format.ts` (client) because the db module is `server-only`. Change both or
  neither.
- **The `Migraciones` admin rail item is code-built** in
  `ADMIN_NAV_SECTION` (`modules/navigation/admin-nav.ts`), not a seeded
  `nav_item` — do not add a nav seed for it in a migration.
- **The `planning` section ships dark** (`is_active = 0`, V20). Do not flip it
  active in the migration; activation + page grants to planner roles are a
  deliberate rollout step. Note the nav-cache gotcha: seeded nav rows do not
  invalidate the persisted `unstable_cache` tagged `"nav"` — trigger a
  `/api/navigation/nav/*` mutation or restart with a cold cache after
  activating.
