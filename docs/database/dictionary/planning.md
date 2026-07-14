# Data dictionary — schema `planning`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-14 (V20; sourced from the applied migration file
> `V20__laser_cut_sequencing.sql` + regenerated Kysely types, not direct
> introspection — `ebi-sql-dev` MCP not used this session). Index:
> [`_index.md`](_index.md).

The `planning` schema is **born in V20** (plan laser-cut-sequencing) and is
**portal-owned** (`ebi_app` CRUD). It holds the EBI cell ↔ EPS laser-station
mapping (`cell_station_link`) and per-cell laser **sequence programs**
(`machine_program` + its ordered `machine_program_entry` nestings). It is
distinct from the ETL-owned `staging` replica it reads from
([`staging.md`](staging.md)). Same house patterns as the rest of the DB: named
CHECK constraints, app-maintained `updated_at` (no triggers), FKs NO ACTION
except one deliberate CASCADE. See `docs/modules/planning.md` and
`docs/database/erd/planning.md`.

## `planning.cell_station_link`

EBI cell ↔ EPS laser-station mapping, managed from **Admin → Migraciones**.
**1:1 both ways**: a cell maps to at most one station (`UQ` on `cell_id`) and a
station to at most one cell (`UQ` on the natural station tuple). Real
cross-schema FK to `production.cell`; **no FK to `staging`** (the station tuple
is validated in the app, since staging is a re-baselinable replica).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| cell_station_link_id | int | no | PK (`PK_cell_station_link`), IDENTITY(1,1) | Surrogate primary key |
| cell_id | int | no | FK → production.cell (no cascade; cross-schema); UNIQUE (`UQ_cell_station_link_cell`) | The EBI (CL-process) cell; at most one link per cell |
| eps_plant_id | int | no | part of UNIQUE (`UQ_cell_station_link_station`) | EPS plant (scope: 1) |
| eps_route_id | int | no | part of UNIQUE (`UQ_cell_station_link_station`) | EPS route (scope: 9) |
| eps_station_id | int | no | part of UNIQUE (`UQ_cell_station_link_station`) | EPS station; the `(plant, route, station)` tuple is unique |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_cell_station_link_created`) | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_cell_station_link_updated`) | UTC last-modified timestamp (app-maintained) |

The cell must be an active `process_id = CL` cell (app-enforced in
`linkStationToCell`, `CellNotAssignableError` otherwise); the 1:1 uniqueness is
DB-backed, the app pre-checks it for friendly `CellAlreadyLinkedError` /
`StationAlreadyLinkedError` messages.

## `planning.machine_program`

A sequence program for one cell on one date (optionally one shift). Lifecycle
`draft → published → archived` (V13 `plant_layout` precedent — archived keeps
history without deletes). **No `name` column in v1**: a program's identity is
`cell + date + shift`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| machine_program_id | int | no | PK (`PK_machine_program`), IDENTITY(1,1) | Surrogate primary key |
| cell_id | int | no | FK → production.cell (no cascade; cross-schema) | The laser cell this program sequences |
| program_date | date | no | | Calendar day the program targets |
| shift | int | yes | CHECK: NULL or IN (1,2,3) (`CK_machine_program_shift`) | EPS `Turno` domain; **NULL = whole day** (the v1 mode) |
| status | nvarchar(20) | no | DEFAULT `draft` (`DF_machine_program_status`); CHECK IN (`draft`,`published`,`archived`) (`CK_machine_program_status`) | Lifecycle state |
| notes | nvarchar(1000) | yes | | Optional free note |
| created_by | int | no | FK → auth.app_user (no cascade; cross-schema) | User who created the program (authorship history) |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_machine_program_created`) | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_machine_program_updated`) | UTC last-modified timestamp (app-maintained) |

Indexes:
`UQ_machine_program_published (cell_id, program_date, shift) UNIQUE WHERE status = 'published'`
(**at most one published program per cell/date/shift**; SQL Server treats NULLs
as equal, so a NULL-shift/whole-day program is unique per cell/date too —
intended). `IX_machine_program_cell (cell_id, program_date DESC)` serves the
per-cell timeline read. Publishing archives the previously-published program for
the same `(cell, date, shift)` in one transaction (`publishProgram`) so the
filtered unique index is never violated mid-transition.

## `planning.machine_program_entry`

Ordered nestings inside a program. Composite natural PK `(machine_program_id,
eps_nesting_id)` (a nesting appears at most once per program) **plus** a UNIQUE
`(machine_program_id, sequence_no)` (a position is used once) — both invariants
live in the DB, no identity needed. Entries **die with their program**
(`ON DELETE CASCADE`, config owned by the parent — the `nav_item` precedent).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| machine_program_id | int | no | PK + FK → planning.machine_program **ON DELETE CASCADE** (`FK_machine_program_entry_program`) | Parent program |
| eps_nesting_id | int | no | PK; **NO FK** (logical ref to `staging.eps_nesting`, by design) | The sequenced nesting; existence validated in the app at insert |
| sequence_no | int | no | UNIQUE `(machine_program_id, sequence_no)` (`UQ_machine_program_entry_sequence`); CHECK > 0 (`CK_machine_program_entry_sequence`) | Order within the program (10, 20, …) |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_machine_program_entry_created`) | UTC creation timestamp |

**No FK to `staging.eps_nesting` on purpose:** staging is an ETL-owned replica
that must stay re-baselinable (a re-baseline must not be blocked by app rows), so
`addEntry` validates the nesting exists in the open window at insert
(`NestingNotOpenError` otherwise). **Reorder recipe:** because
`CK_machine_program_entry_sequence` forbids `sequence_no ≤ 0`, the app's reorder
uses a **positive-offset two-pass** update (`seq + 1_000_000`, then final
`(i+1)*10`) to dodge `UQ_machine_program_entry_sequence` mid-update — negative
temps would violate the CHECK (`reorderPasses` / `reorderEntries` in
`modules/planning/db/program.ts`).

## Seeds (V20, data in `auth`)

Guarded, idempotent (V7/V8/V9/V19 patterns):

- `auth.nav_section` `planning` (`Planeación`, icon `ClipboardCheck`, base path
  `/planning`, sort 40, **`is_active = 0` — dark launch**, V7 `maintenance`
  precedent).
- `auth.nav_item` `Secuenciación láser` (`/planning/laser-sequencing`, icon
  `Layers`, sort 10) under the `planning` section.
- 4 `auth.permission` codes: `planning.program:create`,
  `planning.program:update`, `planning.program:delete`,
  `planning.station_link:manage` (note: the code format rejects hyphens →
  `station_link`, not `station-link`). No `role_permission` seeds (admin bypass,
  ADR 0004).

The **Admin → Migraciones** rail item (`/admin/migrations`) is **not** a seeded
nav row — it is a code-built entry in `ADMIN_NAV_SECTION`
(`src/modules/navigation/admin-nav.ts`).

## Grants (schema scope, V20)

Guarded, idempotent:

- `GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::planning TO ebi_app` — the
  portal owns and mutates `planning`.
- `GRANT SELECT ON SCHEMA::planning TO ebi_agent_ro`.

The ETL login `ebi_etl` gets **no** access to `planning` (it only touches
`staging` + `etl.run_log`).
