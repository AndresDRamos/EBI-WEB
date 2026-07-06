# Data dictionary — schema `produccion`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-03 (V1–V11). Index: [`_index.md`](_index.md).

Production module (plan production-cell-assignment, V11): logical production
structure (line → cell) plus a temporal, historized M:N bridge between
`maint.asset` and cells — the source of truth for where an asset physically
works, replacing the free-text `maint.asset.location`. Same house patterns as
`maint`: named CHECK constraints, soft-delete via `is_active` on catalogs,
app-maintained `updated_at` (no triggers), FKs NO ACTION.
See `docs/modules/production.md` and `docs/database/erd/produccion.md`.

## `produccion.production_line`

Optional sequencing container for cells (e.g. a welding line with
Op 10 → Op 20 → Op 30). Not every cell needs one.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| line_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short line code |
| name | nvarchar(160) | no | | Line name |
| plant_id | int | no | FK → auth.plant (no cascade) | Plant the line belongs to |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_production_line_plant (plant_id, is_active)`.

## `produccion.cell`

Logical production post/function. `line_id` is nullable: standalone cells
(e.g. "Laser 1", "Laser 2") belong to no line.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| cell_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short cell code |
| name | nvarchar(160) | no | | Cell name |
| plant_id | int | no | FK → auth.plant (no cascade) | Plant the cell belongs to |
| line_id | int | yes | FK → produccion.production_line (no cascade) | Owning line; NULL = standalone cell |
| sequence_in_line | int | yes | CHECK > 0 (or NULL); CHECK requires line_id set (`CK_cell_sequence_requires_line`) | Position within the line (Op order) |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_cell_plant (plant_id, is_active)`,
`IX_cell_line (line_id) WHERE line_id IS NOT NULL`,
`UQ_cell_line_sequence (line_id, sequence_in_line) UNIQUE WHERE line_id IS NOT NULL`
(no duplicate "Op 20" within a line; cells without a line stay unconstrained).

## `produccion.asset_cell_assignment`

Temporal M:N bridge asset ↔ cell, historized. A cell can be composed of several
assets and one asset can serve several cells at once (e.g. a feed tower shared
by "Laser 1" and "Laser 2"). Rows are **immutable once written except for
closing `valid_to`**: a reassignment = close the current row + insert a new one,
never an in-place UPDATE of `asset_id`/`cell_id`. There is **no `updated_at` on
purpose** — it would invite the in-place rewrite this design prevents.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| assignment_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| asset_id | int | no | FK → maint.asset (no cascade) | Asset reference; history survives asset retirement |
| cell_id | int | no | FK → produccion.cell (no cascade) | Cell reference; history survives cell retirement |
| role_label | nvarchar(120) | yes | | Free label, e.g. `Laser 1 - position 1`, `Feed tower - shared` |
| valid_from | date | no | DEFAULT CAST(SYSUTCDATETIME() AS DATE) | Start of validity |
| valid_to | date | yes | CHECK ≥ valid_from (or NULL) | End of validity; NULL = currently in effect |
| created_by | int | no | FK → auth.app_user (no cascade) | User who recorded the assignment |
| note | nvarchar(1000) | yes | | Optional note |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |

Indexes: `IX_asset_cell_assignment_asset (asset_id, valid_from)`,
`IX_asset_cell_assignment_cell (cell_id, valid_from)`,
`UQ_asset_cell_assignment_current (asset_id, cell_id) UNIQUE WHERE valid_to IS NULL`
(one *current* row per (asset, cell) pair; does not limit how many distinct
cells an asset serves nor how many assets a cell holds).

## Seeds (V11, data in `auth`)

- `auth.nav_section` `production` (dark-launched `is_active = 0`, icon
  `Factory`, base path `/production`, sort 30) + `auth.nav_item` rows
  `Líneas` (`/production/lines`, `Layers`) and `Celdas` (`/production/cells`,
  `LayoutGrid`).
- 6 `auth.permission` codes: `production.line:{create,update}`,
  `production.cell:{create,update}`, `production.assignment:{create,close}`.
  No `role_permission` seeds (admin bypasses at app layer, ADR 0004).

## Grants (schema scope)

`GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::produccion TO ebi_app`;
`GRANT SELECT ON SCHEMA::produccion TO ebi_agent_ro` (guarded, V11).
