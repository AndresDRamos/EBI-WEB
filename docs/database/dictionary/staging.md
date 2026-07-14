# Data dictionary — schema `staging`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-14 (V20; sourced from the applied migration file
> `V20__laser_cut_sequencing.sql` + regenerated Kysely types, not direct
> introspection — `ebi-sql-dev` MCP not used this session). Index:
> [`_index.md`](_index.md).

The `staging` schema (created empty in V2) gets its **first tables** in V20
(plan laser-cut-sequencing): a **faithful landing** of the EPS laser-cut domain
(Plant 1 / EPS route 9). These tables are written **exclusively by the on-prem
ETL** (`etl/run.mjs`, hard rule #3: READ-ONLY on EPS); the portal reads them and
never writes (`ebi_app` = SELECT only). They carry the **natural EPS keys** with
**no identity columns and no foreign keys** — integrity is EPS's, `staging` is a
replica. `planning.machine_program_entry.eps_nesting_id` references
`staging.eps_nesting` **logically only** so a re-baseline is never blocked by
app rows.

Two deliberate house rules:

- **NULL-tolerant landing** — columns are NULLable even where EPS is NOT NULL
  today (a landing table must not reject a source row), **except** the natural
  keys, `eps_nesting.eps_created_at` (verified NOT NULL) and the `is_deleted`
  flags (normalized `ISNULL(bDeleted,0)` at load because they feed filtered
  indexes).
- **Units stay heterogeneous on purpose** — `eps_nesting.cut_minutes` is
  **minutes**; `eps_part_route_step.process_seconds` / `setup_seconds` are
  **seconds**. Conversion happens in the portal read layer
  (`modules/planning/db/nesting.ts`), never in staging.

EPS datetimes land as `DATETIME2(3)` (preserves `datetime`'s 3.33 ms precision
for watermark math); the portal-owned audit column `loaded_at` is `DATETIME2(0)`
(house style). See `docs/modules/planning.md`, `docs/database/erd/staging.md`
and the ETL runbook `etl/README.md`.

## `staging.eps_nesting`

1:1 with EPS `dbo.tblNesteo` (useful subset + full lifecycle state). PK = the
natural EPS id (`idNesteo`), **no identity**. The plate material code/name are
**denormalized** from `tblMaterial` (kept faithful at `NVARCHAR(1000)`, never
indexed). `row_hash` is an ETL-computed `SHA2_256` over the landed value columns
for cheap change detection in the open-window re-extract.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| eps_nesting_id | int | no | PK (`PK_eps_nesting`), no identity | = `tblNesteo.idNesteo` (natural key) |
| eps_plant_id | int | no | | `idPlanta` (ETL scope: 1 = plant 1) |
| eps_route_id | int | no | | `idRuta` (9 = laser cut) |
| eps_station_id | int | yes | | `idEstacion`; NULL until a station is assigned |
| program_name | nvarchar(35) | yes | | `Nesteo` (NOT unique in EPS) |
| plate_material_id | int | yes | | `idPlaca` → `tblMaterial` |
| plate_material_code | nvarchar(1000) | yes | | `tblMaterial.ClaveMaterial` (denormalized) |
| plate_material_name | nvarchar(1000) | yes | | `tblMaterial.Descripcion` (denormalized) |
| plate_count | int | yes | | `CantidadPlacas` (0 happens) |
| cut_minutes | decimal(12,2) | yes | | `TiempoCorte` — **MINUTES** |
| scrap_pct | decimal(5,2) | yes | | `Scrap` |
| is_kanban | bit | yes | | `EsKanban` |
| eps_priority | int | yes | | `PrioridadNesteo` |
| finished_count | int | yes | | `CantidadTerminada` |
| heat_lot | nvarchar(100) | yes | | `Colada` |
| eps_created_at | datetime2(3) | no | | `FechaCreacion` (EPS NOT NULL, verified) |
| material_requested_at | datetime2(3) | yes | | `FechaSolicitud` |
| material_issued_at | datetime2(3) | yes | | `FechaSurtido` |
| started_at | datetime2(3) | yes | | `FechaInicio` |
| finished_at | datetime2(3) | yes | | `FechaFin`; **NULL = open/pending** (the open-window predicate) |
| is_deleted | bit | no | DEFAULT 0 (`DF_eps_nesting_deleted`) | `ISNULL(bDeleted,0)` normalized at load |
| deleted_at | datetime2(3) | yes | | `FechaBaja` |
| row_hash | varbinary(32) | yes | | ETL `SHA2_256` over the non-key columns (skip-unchanged merges) |
| loaded_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_eps_nesting_loaded`) | Portal audit: when the row was landed |

Indexes:
`IX_eps_nesting_open (eps_plant_id, eps_route_id, eps_station_id) INCLUDE (program_name, plate_count, cut_minutes, eps_priority, eps_created_at, material_requested_at, material_issued_at, started_at) WHERE finished_at IS NULL AND is_deleted = 0`
(the panel workhorse — keeps the read at the ~300-row open window; rows fall out
of it once `finished_at` is set),
`IX_eps_nesting_finished (eps_plant_id, eps_route_id, finished_at DESC) WHERE finished_at IS NOT NULL`
(recently-finished / closure-audit views).

## `staging.eps_nesting_detail`

1:1 with `tblNesteoDetail`. Composite natural PK `(eps_nesting_id, line_no)` —
the PK alone serves the panel's per-nesting lookup. **No FK to `eps_nesting`**
on purpose (staging tables merge independently). Part code/name denormalized
from `tblMaterial`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| eps_nesting_id | int | no | PK (`PK_eps_nesting_detail`) | `idNesteo` |
| line_no | int | no | PK | `No` (line number within the nesting) |
| part_material_id | int | no | | `PartNumber` (component `idMaterial`) |
| part_code | nvarchar(1000) | yes | | `tblMaterial.ClaveMaterial` (denormalized) |
| part_name | nvarchar(1000) | yes | | `tblMaterial.Descripcion` (denormalized) |
| quantity | int | yes | | `Cantidad` |
| wip_quantity | int | yes | | `CantidadWip` |
| wip_released_quantity | int | yes | | `CantidadWipLiberada` |
| rejected_quantity | int | yes | | `CantidadRechazada` |
| row_hash | varbinary(32) | yes | | ETL `SHA2_256` over the non-key columns |
| loaded_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_eps_nesting_detail_loaded`) | Portal audit timestamp |

## `staging.eps_nesting_plan`

**Only the current EPS sequence row per nesting** (`tblNesteoPlan WHERE
bPlanActivo = 1`) → PK = `eps_nesting_id` alone. Deliberately **not** full
history: the portal only needs "what EPS says today" to compare against
`planning.machine_program`; the audit trail lives in EPS. The ETL upserts by PK;
if the active row changes `NoPlan`, the same PK row is overwritten.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| eps_nesting_id | int | no | PK (`PK_eps_nesting_plan`) | `idNesteo` |
| plan_no | int | no | | `NoPlan` (the active plan row); kept for traceability to `tblNesteoPlan` |
| sequence_no | int | yes | | `OrdenNesteo` (EPS's own suggested sequence) |
| planned_date | datetime2(3) | yes | | `Fecha` |
| shift | int | yes | | `Turno` (domain 1..3, verified in EPS) |
| eps_created_at | datetime2(3) | yes | | `FechaCreacion` |
| loaded_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_eps_nesting_plan_loaded`) | Portal audit timestamp |

## `staging.eps_cutting_station`

`Planeacion.tblEstacionRuta`, laser scope. PK `(eps_plant_id, eps_route_id,
eps_station_id)` — the tuple `tblNesteo` carries and
`planning.cell_station_link` resolves. Verified unique for real routes (EPS
duplicates exist only where `IdRuta = 0`, which the ETL excludes by contract).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| eps_plant_id | int | no | PK (`PK_eps_cutting_station`) | `idPlanta` |
| eps_route_id | int | no | PK | `IdRuta` (never 0: ETL contract) |
| eps_station_id | int | no | PK | `IdEstacion` |
| eps_process_id | int | yes | | `IdProceso` (informational; landed as a plain column) |
| description | nvarchar(60) | yes | | `EstacionDescripcion` |
| available_hours | decimal(5,2) | yes | | `HorasDisponibles` (informational capacity reference) |
| serial_no | nvarchar(100) | yes | | `NoSerie` |
| is_deleted | bit | no | DEFAULT 0 (`DF_eps_cutting_station_deleted`) | `ISNULL(bDeleted,0)` normalized at load |
| loaded_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_eps_cutting_station_loaded`) | Portal audit timestamp |

## `staging.eps_part_route_step`

`tblMaterialRutaTiempo` for parts present in nesting details (post-laser
routing). PK mirrors the EPS PK `(part_material_id, eps_route_id)`. The panel
reads "route of part X ordered by `fabrication_order`": PK-prefix seek + a tiny
sort (~10 rows), no extra index. `process_seconds` is **seconds** at source (vs.
`eps_nesting.cut_minutes` in minutes — do **not** homogenize in staging).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| part_material_id | int | no | PK (`PK_eps_part_route_step`) | `idMaterial` |
| eps_route_id | int | no | PK | `idRuta` |
| fabrication_order | int | yes | | `OrdenFabricacion` (10, 20, … 999 = shipping) |
| eps_process_id | int | yes | | via `tblRuta.idProceso` |
| route_name | nvarchar(200) | yes | | `tblRuta` name (denormalized) |
| process_name | nvarchar(200) | yes | | `tblProceso` name (denormalized) |
| process_seconds | int | yes | | `TiempoProceso` — **SECONDS** |
| setup_seconds | int | yes | | `TiempoSetup` — SECONDS (NULLs at source) |
| eps_plant_id | int | yes | | `IdPlanta` |
| loaded_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() (`DF_eps_part_route_step_loaded`) | Portal audit timestamp |

## Grants (schema scope, V20)

Guarded, idempotent (skipped if the principal is absent):

- `GRANT SELECT ON SCHEMA::staging TO ebi_app` — the portal **reads** staging,
  never writes.
- `GRANT SELECT ON SCHEMA::staging TO ebi_agent_ro`.
- `GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::staging TO ebi_etl` — the
  ETL login; `DELETE` is the re-baseline capability. `ebi_etl` must be created
  by a human **before** V20 runs in each database (done in `EBI_dev`
  2026-07-14; required in `EBI` before the production run).
