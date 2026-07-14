---
id: laser-cut-sequencing
status: committed
created: 2026-07-14
touches: [production, org, rbac, navigation]
migrations: [V20]
supersedes: null
superseded_by: null
---

# Laser cut sequencing — Plant 1 nesting panel + per-machine programs

## Objective

Give production programmers a portal tool to sequence the laser-cut plan of
Plant 1: a panel showing the pending EPS nestings (plate nesting programs from
`EPS.dbo.spskPlanCorte`'s domain) and a per-machine, per-date sequence program
built by dragging nestings onto a machine timeline. v1 shows the **loaded**
time per machine (cut minutes + fixed 15-min setup per nesting) and the part
numbers each nesting contains with their downstream process route — it does
**not** model finite available capacity yet (explicit non-goal; this is the
first step toward an APS).

Data flows one way: a Node ETL script (run on-prem, EPS is read-only per hard
rule #3) lands the laser-cut domain into `staging.*`; the portal reads staging
and owns its own sequencing data in the new `planning` schema. Nothing is ever
written back to EPS.

## Scope decisions (user-confirmed 2026-07-14)

- Plant 1 only; **route 9 (Corte Láser) only** — the ETL is parameterized by
  (plant, route) but v1 ships with that single scope constant.
- Program granularity: **machine (cell) + date**; `shift` stays in the schema
  (nullable, CHECK 1–3 verified against EPS) but v1 UI works per whole day.
- "Publish" is portal-only state; EPS stays read-only forever for this module.
- Access: roles `Planeador` (dept Planeación) and `Gerente de planta` (dept
  Operaciones) get the grants — human step in `/admin/portal/permissions`
  after activation (grants are never migration-seeded, ADR 0004).
- EPS route ↔ `org.process` mapping is **explicitly deferred**: v1 hardcodes
  route 9 ↔ process `CL` as a module constant; a `planning.route_process_link`
  becomes necessary only when a second process onboards (future work).
- Missing laser cells (EPS has 9 active stations LASER 01–08 + 11; EBI has 2
  cells) are created by a human via the portal (cell codes are app-generated —
  never seeded by SQL), then linked in the new Admin → Migraciones screen.

## Source facts (verified live 2026-07-14, read-only)

- `EPS.dbo.tblNesteo` (PK `idNesteo`, identity): one nesting = one plate
  (`idPlaca`), one station (`idEstacion`) of one route (`idRuta`) in one plant.
  `TiempoCorte` numeric(12,2) is **minutes**; `Nesteo` (program name, 35 chars)
  is NOT unique; `CantidadPlacas` can be 0. Lifecycle via dates:
  `FechaSolicitud` → material requested, `FechaSurtido` → issued,
  `FechaInicio` → in progress, `FechaFin` → finished (open = NULL),
  `bDeleted`/`FechaBaja` → cancelled. **No rowversion / no FechaModificacion.**
- `tblNesteoDetail` (PK `idNesteo, No`): `PartNumber` = component
  `idMaterial`, `Cantidad` pieces (+ WIP/rejected counters).
- `tblNesteoPlan` (PK `idNesteo, NoPlan`): EPS's own sequence; only
  `bPlanActivo = 1` is current (1 row per nesting).
- `Planeacion.tblEstacionRuta`: stations. `(idPlanta, IdRuta, IdEstacion)` is
  unique **for real routes** — duplicates exist only where `IdRuta = 0`
  (verified), so the ETL must exclude `IdRuta = 0`. Plant 1 / route 9 has 9
  active stations; `HorasDisponibles` per station is available.
- Downstream route: `tblMaterialRutaTiempo` by `PartNumber`, ordered by
  `OrdenFabricacion` (10,20,…,999 = shipping); `TiempoProceso` is **seconds**.
- Open window today: ~294 pending nestings (plant 1 / route 9), 3–10
  components each.
- `Turno` domain verified: 1, 2, 3.
- Watermark strategy (no modification timestamp at source): new ids by
  `idNesteo > watermark` + full re-extract of the open window
  (`FechaFin IS NULL`) + closures by `FechaFin >= last run`; idempotent MERGE
  by natural key with `row_hash` change detection. The ETL reads base tables,
  **never executes `spskPlanCorte`** (its plate-inventory WHILE loops are
  expensive and unneeded at this grain).

## Database impact (dba sub-agent, 2026-07-14)

`V20__laser_cut_sequencing.sql` — **all additive, zero irreversible
operations**:

- Schema `planning` (new; `staging`/`etl` exist since V2).
- `staging.eps_nesting`, `eps_nesting_detail`, `eps_nesting_plan` (current
  row only), `eps_cutting_station`, `eps_part_route_step` — faithful EPS
  landing, natural PKs, **no identity, no FKs** (replica; integrity is
  EPS's), filtered index `IX_eps_nesting_open` keeps the panel read at ~300
  rows forever; `row_hash` enables skip-unchanged merges. Units land
  heterogeneous on purpose (minutes vs seconds) — convert in the read layer.
- `planning.cell_station_link` (1:1 both ways cell ↔ EPS station; real FK to
  `production.cell`), `planning.machine_program` (cell + date + nullable
  shift; `draft → published → archived`; filtered unique = one published per
  cell/date/shift), `planning.machine_program_entry` (PK (program, nesting),
  UNIQUE (program, sequence_no), CASCADE with program; `eps_nesting_id` has
  **no FK to staging** by design — staging must stay re-baselinable; the app
  validates existence on insert).
- Seeds: nav section `planning` ("Planeación", `is_active = 0` dark launch) +
  item "Secuenciación láser" → `/planning/laser-sequencing`; permissions
  `planning.program:create|update|delete`, `planning.station_link:manage`
  (hyphen is rejected by `CK_permission_code_format` — underscore).
- Grants (guarded, idempotent): `ebi_app` SELECT on staging/etl + CRUD on
  planning; `ebi_agent_ro` SELECT; `ebi_etl` CRUD on staging + INSERT/UPDATE
  on etl (no DELETE — audit). **`ebi_etl` was created in `EBI_dev` by the
  user before this migration** (same human step required in `EBI` before the
  production run).
- Operational cautions: `staging.eps_nesting` is merged, never truncated in
  normal operation (published programs reference it without FK); a re-baseline
  is a coordinated runbook operation.
- Reorder recipe: `CK (sequence_no > 0)` forbids the negative-temp two-pass
  used by `reorderCellChildren` — use a **positive** offset (+1000000) pass.

ERD delta: `erd/staging.md` + `erd/planning.md` are born (and their
dictionary pages); `production.md` gains two inbound cross-schema FKs;
`auth.md` notes the seeds; `etl.md` notes the `run_log.entity` values.

## ETL design

- `etl/` folder at repo root (own `package.json` deps kept inside the main
  workspace; runs with `pnpm etl:run`), plain Node + `tedious` (already a
  dependency) — one connection to EPS (read-only SQL login, env
  `EPS_SQL_*`), one to Azure SQL as `ebi_etl` (env `EBI_ETL_*`). No Next.js
  involvement — the portal cannot reach 192.168.4.5.
- Runs on any always-on Windows box in the plant LAN via Task Scheduler;
  suggested cadence 15 min during plant hours (user-owned parameter).
- Each run: extract open window + new ids + recent closures (scope: plant 1,
  route 9; stations exclude `IdRuta = 0`; nesting query joins material for
  plate/part code+name denormalization), compute SHA-256 `row_hash`, MERGE
  into staging (update only when hash differs), upsert the active
  `tblNesteoPlan` row per nesting, refresh `eps_cutting_station` and
  `eps_part_route_step` (route steps only for parts present in open
  nestings), write one `etl.run_log` row per entity (status, rows_loaded,
  watermark, message on failure).
- Estimated traffic: ~5–6k rows read from EPS per run (~1–3 MB on LAN),
  cloud-bound writes are deltas only (<100 KB typical). Initial load is the
  open window only — historic nestings (285k) are NOT loaded.
- The panel surfaces freshness from `etl.run_log` (max `finished_at` per
  entity) and warns when stale (> 2× cadence).

## Design spec

**`/planning/laser-sequencing`** (client page over one RSC load; section
guard `requireSectionOrRedirect("planning")` in
`(portal)/planning/layout.tsx`):

- **Left panel — backlog**: pending nestings (open window) **not yet in the
  visible date's programs**. Card: program name, plate code, plate count, cut
  time, EPS priority, age, status badges (requested/issued/in-progress)
  derived from lifecycle dates, EPS-suggested station badge; expandable to
  components (part code, qty, downstream route chips: Nivelado → Doblez → …
  with per-process times from `eps_part_route_step`). Sort control
  (priority/date/time) + floating filter panel behind a button (material
  status, plate, part search, "only selected machine's EPS suggestion").
  Cards are **draggable** onto machine rows (pointer capture — house pattern
  from `layout-editor`; no DnD library).
- **Center — machine timeline** (the core new component, hand-built
  SVG/divs, no Gantt library): one row per laser cell (from
  `cell_station_link`-mapped cells), horizontal time axis for the selected
  date; each program entry renders as a block whose position/width =
  cumulative `cut_minutes` + 15 min setup from day start; subtle reference
  line at the station's `available_hours` (from staging — informational
  only, NOT a capacity model). Date navigation (prev/next/picker) +
  granularity toggle **Día / Semana** (week = one aggregated bar per day,
  hours loaded; click a day → day view). Drop on a row appends the nesting
  to that cell's draft program for the visible date (creates the draft on
  first drop). Click a row header selects the machine.
- **Right panel — machine detail (hidden until selection)**: expands with
  total loaded hours, nesting count, the ordered sequence (arrow/drag
  reorder, positive-offset two-pass persist), per-position accumulated time,
  EPS's own current sequence (`eps_nesting_plan`) as read-only comparison,
  remove-entry, and **Publicar** (draft → published; republish archives the
  previous published program).
- Decomposed from day one (lesson from ui-monoliths-decomposition):
  orchestrator `laser-sequencing-page.tsx` + `nesting-backlog.tsx` +
  `machine-timeline.tsx` + `machine-detail-panel.tsx` + hook
  `use-program-editor.ts`. Kit reuse: `PageTabs`, `EntityCard`,
  `ExpandingModal`, semantic badges, `ConfirmDialog`.

**`/admin/migrations`** (new admin rail item "Migraciones", code-built in
`ADMIN_NAV_SECTION`; admin-only via the existing `/admin` guard):

- Single tab **"Mapeos"** (`PageTabs`, room to grow: agrupaciones, legacy vs
  portal data, etc.).
- A **mapping-type dropdown** listing the available `*_link` entities — v1
  has one: "Estaciones láser (EPS) ↔ Celdas (EBI)"
  (`planning.cell_station_link`). Selecting it loads a table with one row
  per record from BOTH sides: EPS station (description, serial, plant/route)
  | linked EBI cell (or inline selector to assign one of the unlinked
  CL-process cells) | link status (mapped ✓ / missing in portal / missing in
  legacy). Link/unlink inline; mutations gated by
  `planning.station_link:manage`.
- The dropdown+table shell is generic on purpose: each future `*_link`
  table registers as one more selector entry with its own columns.

## Steps

1. **Migration** (this session, on approval): materialize
   `db/migrations/V20__laser_cut_sequencing.sql`, register in
   `docs/database/migrations-log.md`, apply to `EBI_dev`
   (`flyway -configFiles=db/flyway.dev.conf,db/flyway.dev.conf.local migrate`
   + clean `flyway info`), `pnpm db:gen`.
2. **ETL script**: `etl/run.mjs` (+ `etl/README.md` runbook: machine
   requirements, Task Scheduler setup, env vars, re-baseline procedure) and
   `pnpm etl:run` script; extractors/merges as per ETL design above;
   `.env.example` gains `EPS_SQL_*` / `EBI_ETL_*` names (names only — no
   secrets in repo).
3. **Module data layer**: `src/lib/db/schema-clients.ts` gains `stagingDb`,
   `planningDb`, `etlDb` (read of `run_log`); `src/modules/planning/db/`
   (one file per aggregate): `nesting.ts` (open-window reads + details +
   route steps + freshness), `program.ts` (CRUD + entries + positive-offset
   reorder + publish transition + entry-existence validation),
   `station-link.ts` (list both sides + link/unlink).
4. **API** `/api/planning/...`: `GET nestings` (backlog + filters),
   `GET/POST programs`, `GET/PATCH programs/[id]` (status, notes),
   `POST programs/[id]/entries` (+ `DELETE .../entries/[nestingId]`,
   `POST .../entries/reorder`), `GET/POST/DELETE station-links`. Reads
   `requireUser`; mutations `requirePermission("planning.…")` per the
   seeded codes.
5. **Portal UI**: segment layout + guard, the sequencing page per Design
   spec.
6. **Admin UI**: "Migraciones" rail item + `/admin/migrations` page per
   Design spec.
7. **Human steps** (user, before verification can pass end-to-end): create
   the missing laser cells via Producción → Celdas operativas; map the 9
   stations in Admin → Migraciones; run the ETL once
   (`pnpm etl:run`) from a machine that reaches both servers; later:
   activate section `planning` + grant roles in `/admin/portal/permissions`
   (nav-cache gotcha: fire any `/api/navigation/nav/*` mutation after the
   migration or the guard keeps redirecting).
8. **docs-sync** (unconditional) + verification: `pnpm lint && pnpm build`
   + vitest for the ETL merge/watermark helpers and reorder logic + visual
   pass against this plan's Objective; gaps logged as Amendments →
   `status: verified`.

## Acceptance checks

- `flyway info` clean on `EBI_dev`; `pnpm db:gen` regenerates types with the
  new schemas; `pnpm lint && pnpm build` pass.
- ETL run against real EPS lands the open window (~294 nestings) with
  details/plan/stations/route-steps and logs per-entity rows in
  `etl.run_log`; a second immediate run writes ~0 updated rows (hash skip).
- Backlog shows pending nestings with component drill-down and downstream
  route; dragging one onto a machine row creates/extends that cell's draft
  program for the visible date; the timeline block positions match
  cumulative minutes + 15-min setup; publish enforces the one-published
  uniqueness; EPS comparison sequence visible in the detail panel.
- Admin → Migraciones lists 9 EPS stations vs EBI CL cells with correct
  missing/mapped states; linking persists and reflects in the sequencing
  page's machine rows.
- Non-admin without grants: section invisible + pages redirect; with
  `Planeador` grants: full flow works; EPS untouched (read-only login).

## Future work (explicitly out of scope)

- Finite capacity / APS math (shift calendars, real machine capacity, load
  vs. capacity netting).
- EPS route ↔ `org.process` mapping table (needed when a second process
  onboards; becomes one more entry in Admin → Migraciones → Mapeos).
- Shop-floor screens (cell operators, forklift/material handlers): same
  solution, separate route group (kiosk-style layout, e.g. `(shop)/…`),
  reusing staging/planning data and RBAC; revisit auth model (shared
  kiosk/PIN) when specified.

## Amendments

<!-- Appended during the verification phase; never edited into the sections
above. -->

### Build session 2026-07-14 (`/build-plan`)

1. **Semana view deferred (gap vs Design spec).** The center timeline ships the
   **Día** view fully (date prev/next + picker, blocks positioned by cumulative
   `cut_minutes` + 15-min setup, available-hours reference line, drop-to-add,
   reorder, publish). The **Día / Semana granularity toggle** (aggregated
   one-bar-per-day week overview) was **not** built in v1 to bound scope. Core
   objective still holds without it; revisit as a follow-up if needed.
2. **`.env.example` not updated by tooling.** This environment denies writing
   `.env.example`, so the `EPS_SQL_*` / `EBI_ETL_*` variable **names** were not
   added there. They are fully documented in `etl/README.md` (Configuration).
   Human step: add the names (names only, no values) to `.env.example`.
3. **Kit reuse deviated where components didn't fit.** `PageTabs`,
   `ConfirmDialog`, `Badge`, `Button`, `Table` and `Textarea` are reused. The
   backlog cards, machine timeline and detail panel are **bespoke** components
   (reusing those primitives) rather than `EntityCard`/`ExpandingModal`, which
   don't support pointer-drag or inline component drill-down. The floating
   filter panel is a toggle-reveal panel behind a button (not a popover).
4. **ETL testability.** Pure ETL helpers (`row_hash`, OPENJSON MERGE builder,
   watermark, scope) live in `etl/lib/transform.mjs` and are unit-tested
   (`etl/lib/transform.test.mjs`); `vitest.config.ts` was extended to include
   `etl/**/*.test.mjs`. The closure/cancellation re-extract uses an
   EPS-`GETDATE()` lookback window (default 3 days) instead of a cross-server
   `run_log` timestamp comparison, to avoid EPS-local vs UTC clock skew; first
   run (no prior `success` in `run_log`) loads the open window only.

### Verification evidence (2026-07-14)

- `pnpm lint` → 0 errors (1 pre-existing warning in `location-cells-modal.tsx`,
  unrelated). `pnpm build` → compiled successfully, all `/api/planning/*`,
  `/planning/laser-sequencing` and `/admin/migrations` routes emitted.
- `pnpm test` → **87 passed** (13 files), including the ETL merge/hash/watermark
  helpers, the positive-offset reorder logic, and the planning request schemas.
- Runtime smoke on a worktree dev server (empty `EBI_dev` staging/planning):
  unauth `/planning/laser-sequencing` and `/admin/migrations` → 307 → `/login`
  (guards execute); authenticated (tester/admin) → **200**, both pages render
  their empty states with no server exception (real queries against the new
  empty tables run cleanly).
- **Deferred to the human steps (Step 7 of the plan):** the full end-to-end
  visual pass — ETL landing ~294 nestings, creating/mapping the 9 laser cells,
  drag→timeline positioning, publish uniqueness — requires the on-prem ETL run
  + cell creation + station mapping + section activation/grants, none of which
  can run in this session.
