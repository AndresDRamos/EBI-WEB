# EPS → EBI staging ETL (laser-cut sequencing)

Standalone Node script that lands the **laser-cut domain (Plant 1 / route 9)**
from **EPS SQL Server** into **`staging.*`** on the EBI Azure SQL database, plus
one `etl.run_log` row per entity.

The Next.js portal cannot reach EPS (192.168.4.5). This script is the only
bridge and it is **READ-ONLY on EPS** (hard rule #3): it never issues a write
against EPS, only `SELECT`s. It writes to EBI as the least-privileged `ebi_etl`
login (CRUD on `staging`, INSERT/UPDATE on `etl.run_log`).

## What a run does

| Entity | Source | Strategy |
| --- | --- | --- |
| `eps_nesting` | `dbo.tblNesteo` (+ `tblMaterial`) | Open window (`FechaFin IS NULL`, not deleted) **every run** + recent closures/cancellations within `closureLookbackDays`. `row_hash` MERGE → a second immediate run writes ~0 rows. |
| `eps_nesting_detail` | `dbo.tblNesteoDetail` (+ `tblMaterial`) | Components of the same nestings. `row_hash` MERGE. |
| `eps_nesting_plan` | `dbo.tblNesteoPlan` | Active row only (`bPlanActivo = 1`), one per nesting. Upsert. |
| `eps_cutting_station` | `PLANEACION.tblEstacionRuta` | The ~9 laser stations (full refresh). |
| `eps_part_route_step` | `dbo.tblMaterialRutaTiempo` (+ `tblRuta`, `tblProceso`) | Downstream route of parts present in the open window. |

**First run** loads the open window only (no closures backfill), so it never
pulls the ~285k historic nestings. First-run detection = no `success` row for
`entity = 'eps_nesting'` in `etl.run_log`.

Units land heterogeneous **on purpose**: `cut_minutes` is minutes,
`process_seconds`/`setup_seconds` are seconds. Convert in the portal read layer,
never in staging.

## Requirements

- A Windows box on the plant LAN that can reach **both** EPS (192.168.4.5:1433)
  and the EBI Azure SQL server (outbound 1433).
- Node 20+ (same major as the portal; `--env-file` support).
- `pnpm install` in the repo root (uses the workspace `tedious` dependency —
  no separate install).

## Configuration (`.env`)

The script reads its own env block. Secrets live only in `.env` (gitignored) —
never in the repo. Add these keys (values are examples/placeholders):

```
# EPS source (read-only login; on-prem SQL Server)
EPS_SQL_SERVER=192.168.4.5
EPS_SQL_DATABASE=EPS
EPS_SQL_USER=<read-only login>
EPS_SQL_PASSWORD=<secret>
EPS_SQL_PORT=1433
EPS_SQL_ENCRYPT=false          # LAN SQL Server; set true + trusted cert if required

# EBI target — SAME server/database as the portal (reuses DB_SERVER /
# DB_DATABASE); only the login differs (ebi_etl instead of ebi_app).
DB_SERVER=<server>.database.windows.net   # shared with the portal
DB_DATABASE=EBI                 # EBI_dev while validating
EBI_ETL_USER=ebi_etl
EBI_ETL_PASSWORD=<secret>
EBI_ETL_PORT=1433
EBI_ETL_ENCRYPT=true           # Azure SQL requires encryption
```

> `DB_SERVER` / `DB_DATABASE` are the portal's own variables, reused so the ETL
> always targets the same database as the app — only the credentials
> (`EBI_ETL_USER` / `EBI_ETL_PASSWORD`) point at the `ebi_etl` login.

> These key **names** also belong in `.env.example` (names only, no values).
> They were not added automatically because tooling here cannot write
> `.env.example` — add them by hand.

### EPS source login

The `EPS_SQL_*` login is a **read-only** account scoped to just the 8 tables the
ETL reads (table-level `SELECT`, least privilege — not `db_datareader`). Create
it on EPS as sysadmin with [`eps-readonly-login.sql`](./eps-readonly-login.sql)
(set the password there; it goes into `.env` as `EPS_SQL_PASSWORD`, never in the
repo). The script is idempotent and never writes EPS data (hard rule #3).

### EBI target login

`ebi_etl` must be **created by a human before V20 runs** in each database
(already done in `EBI_dev`; required in `EBI` before the production migration).

## Run

```
pnpm etl:run
```

Suggested cadence: **every 15 min during plant hours** via Windows Task
Scheduler (user-owned parameter). Exit code is non-zero if any entity failed;
per-entity status/rows/watermark/message land in `etl.run_log`. The portal panel
surfaces freshness from `etl.run_log` and warns when stale (> 2× cadence).

Example Task Scheduler action:

- Program: `pnpm`  (or `node`)
- Arguments: `etl:run` (or `--env-file=.env etl/run.mjs`)
- Start in: the repo root.

## Re-baseline (coordinated runbook op)

`staging.eps_nesting` is **merged, never truncated** in normal operation —
published `planning.machine_program_entry` rows reference `eps_nesting_id`
logically (no FK, by design). A full re-baseline (rare) means: stop the
schedule, `DELETE`/reload staging, confirm no published program references a
dropped nesting, restart. `ebi_etl` holds `DELETE` on `staging` for exactly
this.

## Tests

Pure transform helpers (`row_hash`, MERGE builder, watermark, scope) are unit
tested without a database:

```
pnpm test            # includes etl/**/*.test.mjs
```

A live end-to-end run against real EPS + EBI is a human validation step
(acceptance: first run lands ~294 nestings; an immediate second run writes ~0).
