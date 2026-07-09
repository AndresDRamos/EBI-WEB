# Data dictionary — schema `production`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-08 (V1–V18; V18 sourced from the adopted-from-live
> migration file `V18__org_locations_type_processes.sql` + regenerated Kysely
> types, not direct introspection). Index: [`_index.md`](_index.md).
> V15 left `production`'s tables unchanged but transferred `auth.plant` →
> `org.plant`, so the `plant_id` FKs below now cross to `org.plant`. V18 added
> `cell.location_id` (NULLable FK to the new `org.location`).

Production module (created as `produccion` by V11, plan
production-cell-assignment; renamed to `production` by V12, plan
production-schema-rename; plant-layout tables added by V13, plan
plant-layout-foundation): logical production structure (line → cell) plus a
temporal, historized M:N bridge between `maint.asset` and cells — the source
of truth for where an asset physically works, replacing the free-text
`maint.asset.location` — and, since V13, the **physical** side: versioned
immutable plant-layout canvases (from DXF, ADR 0006), per-asset top-view
footprints and temporal, historized placements of assets on a layout. Same
house patterns as `maint`: named CHECK constraints, soft-delete via
`is_active` on catalogs, app-maintained `updated_at` (no triggers), FKs
NO ACTION.
See `docs/modules/production.md` and `docs/database/erd/production.md`.

## `production.production_line`

Optional sequencing container for cells (e.g. a welding line with
Op 10 → Op 20 → Op 30). Not every cell needs one.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| line_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short line code |
| name | nvarchar(160) | no | | Line name |
| plant_id | int | no | FK → org.plant (no cascade; cross-schema since V15) | Plant the line belongs to |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_production_line_plant (plant_id, is_active)`.

## `production.cell`

Logical production post/function. `line_id` is nullable: standalone cells
(e.g. "Laser 1", "Laser 2") belong to no line. Since V18 a cell may also sit
inside a named plant location (`location_id`, NULLable); the API validates
that the location belongs to the cell's plant (422).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| cell_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short cell code |
| name | nvarchar(160) | no | | Cell name |
| plant_id | int | no | FK → org.plant (no cascade; cross-schema since V15) | Plant the cell belongs to |
| line_id | int | yes | FK → production.production_line (no cascade) | Owning line; NULL = standalone cell |
| sequence_in_line | int | yes | CHECK > 0 (or NULL); CHECK requires line_id set (`CK_cell_sequence_requires_line`) | Position within the line (Op order) |
| location_id | int | yes | FK → org.location (no cascade; cross-schema) (added V18) | Named location the cell sits in; NULL = not linked |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_cell_plant (plant_id, is_active)`,
`IX_cell_line (line_id) WHERE line_id IS NOT NULL`,
`IX_cell_location (location_id) WHERE location_id IS NOT NULL` (V18, filtered
— only linked rows pay),
`UQ_cell_line_sequence (line_id, sequence_in_line) UNIQUE WHERE line_id IS NOT NULL`
(no duplicate "Op 20" within a line; cells without a line stay unconstrained).

## `production.asset_cell_assignment`

Temporal M:N bridge asset ↔ cell, historized. A cell can be composed of several
assets and one asset can serve several cells at once (e.g. a feed tower shared
by "Laser 1" and "Laser 2"). Rows are **immutable once written except for
closing `valid_to`**: a reassignment = close the current row + insert a new one,
never an in-place UPDATE of `asset_id`/`cell_id`. There is **no `updated_at` on
purpose** — it would invite the in-place rewrite this design prevents.

Since V18 the create/reassign APIs enforce the cross-schema invariant
`cell.location_id = maint.asset.location_id` (the cell must be linked to a
location and it must be the asset's own — 422 otherwise; app-enforced, no
triggers). When an asset moves to another location, the maintenance asset
PATCH auto-closes its current assignments (historized close, never a delete).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| assignment_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| asset_id | int | no | FK → maint.asset (no cascade) | Asset reference; history survives asset retirement |
| cell_id | int | no | FK → production.cell (no cascade) | Cell reference; history survives cell retirement |
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

## `production.plant_layout`

Immutable, **versioned** canvas per plant (V13). A DXF upload is parsed into
normalized JSON (CAD contract, `docs/architecture/cad-layout-contract.md`) and
lands as a `draft`; confirming it activates the draft and archives the previous
`active`. Geometry is **never edited in place** — a correction is a new upload
= a new version (ADR 0006). No generic `updated_at`: the only legitimate
mutations are lifecycle transitions, captured by `activated_at` / `archived_at`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| layout_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| plant_id | int | no | FK → org.plant (no cascade; cross-schema since V15); UQ with version | Plant the canvas belongs to |
| version | int | no | CHECK > 0; UQ `(plant_id, version)` | Version number within the plant |
| name | nvarchar(160) | no | | Layout name (defaults to the uploaded filename) |
| note | nvarchar(1000) | yes | | Optional note |
| source_blob_path | nvarchar(400) | no | | Archived original DXF in the private `production` Azure Blob container (path only, never content) |
| width_m | decimal(9,3) | no | CHECK > 0 (`CK_plant_layout_extents`) | Canvas width, meters |
| height_m | decimal(9,3) | no | CHECK > 0 (`CK_plant_layout_extents`) | Canvas height, meters |
| geometry | nvarchar(max) | no | CHECK `ISJSON = 1` | Normalized geometry JSON (outline/walls/columns/aisles/zones/routes/ports), meters, origin (0,0) bottom-left |
| status | nvarchar(20) | no | DEFAULT `draft`; CHECK `draft`\|`active`\|`archived` | Lifecycle state |
| created_by | int | no | FK → auth.app_user (no cascade) | Uploader |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| activated_at | datetime2(0) | yes | | Set once, when the draft is confirmed |
| archived_at | datetime2(0) | yes | | Set once, when a newer version replaces it (or it is retired) |

Indexes: `UQ_plant_layout_plant_version (plant_id, version) UNIQUE` (also serves
"versions of plant X" — no separate IX on plant_id),
`UQ_plant_layout_active (plant_id) UNIQUE WHERE status = 'active'`
(**exactly one active layout per plant**; drafts/archived unconstrained).

JSON in NVARCHAR(MAX), not the native GEOMETRY type: rendering is client-side,
no server-side spatial predicates exist yet, and the DXF-derived payload does
not map cleanly onto OGC primitives. Revisit when a real spatial query appears.

## `production.asset_footprint`

Top-view shape per asset (V13), **one per asset** (`UQ_asset_footprint_asset`).
Unlike placements, footprints are **editable in place** (shape is presentation,
not history — position history lives in `asset_placement`). Sourced from a
small DXF per the CAD contract or a plain W×D rectangle quick-create.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| footprint_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| asset_id | int | no | FK → maint.asset (no cascade); UQ | One footprint per asset |
| width_m | decimal(9,3) | no | CHECK > 0 (`CK_asset_footprint_extents`) | Bounding width, meters |
| depth_m | decimal(9,3) | no | CHECK > 0 (`CK_asset_footprint_extents`) | Bounding depth, meters |
| geometry | nvarchar(max) | no | CHECK `ISJSON = 1` | JSON polygon + optional IN/OUT ports, local coordinates in meters (a rectangle is stored the same way) |
| source_kind | nvarchar(12) | no | CHECK `dxf`\|`rectangle` | Where the shape came from |
| source_blob_path | nvarchar(400) | yes | CHECK: NULL unless `source_kind = 'dxf'` (`CK_asset_footprint_source_path`) | Archived source DXF path, when applicable |
| created_by | int | no | FK → auth.app_user (no cascade) | Author |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp (app-maintained) |

Indexes: `UQ_asset_footprint_asset (asset_id) UNIQUE` (doubles as the
FK-support index).

## `production.asset_placement`

Temporal, historized position of an asset on a layout (V13) — same invariant
family as `asset_cell_assignment`: a reposition = **close the current row
(`valid_to`) + insert a new one**, never an in-place UPDATE of
`x_m`/`y_m`/`rotation_deg`. **No `updated_at` on purpose.** Pose semantic
(app-level): `x_m`/`y_m` = **center of the footprint bbox**, rotation about
that center. The cross-schema invariant "the asset's plant =
`plant_layout.plant_id`" is enforced by the app on create (no triggers);
since V18 the asset's plant is derived via `maint.asset.location_id →
org.location.plant_id`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| placement_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| layout_id | int | no | FK → production.plant_layout (no cascade) | Canvas the placement lives on |
| asset_id | int | no | FK → maint.asset (no cascade) | Asset reference; history survives asset retirement |
| x_m | decimal(9,3) | no | | X of the footprint bbox center, meters |
| y_m | decimal(9,3) | no | | Y of the footprint bbox center, meters |
| rotation_deg | decimal(5,2) | no | DEFAULT 0; CHECK 0 ≤ deg < 360 (`CK_asset_placement_rotation`) | Rotation about the bbox center |
| valid_from | date | no | DEFAULT CAST(SYSUTCDATETIME() AS DATE) | Start of validity |
| valid_to | date | yes | CHECK ≥ valid_from (or NULL) | End of validity; NULL = currently in effect |
| created_by | int | no | FK → auth.app_user (no cascade) | User who recorded the placement |
| note | nvarchar(1000) | yes | | Optional note |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |

Indexes: `IX_asset_placement_layout (layout_id, valid_from)`,
`IX_asset_placement_asset (asset_id, valid_from)`,
`UQ_asset_placement_current (layout_id, asset_id) UNIQUE WHERE valid_to IS NULL`
(one *current* placement per asset **per layout** — deliberately NOT per asset
globally: a draft can be populated while the active layout still holds the live
position. Physical truth = current placement JOIN layout WHERE
`status = 'active'`; `UQ_plant_layout_active` bounds that join to one row per
plant. On activation the app closes the outgoing layout's open rows and
carries them forward onto the new version).

## Seeds (V11, data in `auth`)

- `auth.nav_section` `production` (dark-launched `is_active = 0`, icon
  `Factory`, base path `/production`, sort 30) + `auth.nav_item` rows
  `Líneas` (`/production/lines`, `Layers`) and `Celdas` (`/production/cells`,
  `LayoutGrid`).
- 6 `auth.permission` codes: `production.line:{create,update}`,
  `production.cell:{create,update}`, `production.assignment:{create,close}`.
  No `role_permission` seeds (admin bypasses at app layer, ADR 0004).

## Seeds (V13, data in `auth`)

- `auth.nav_item` `Layout` (`/production/layout`, icon `Map`, sort 30) under
  the existing `production` section (guarded, idempotent). No new section; no
  nav item for `/production/footprints` (reached via a header button in the
  layout viewer).
- 6 `auth.permission` codes: `production.layout:{create,activate,archive}`,
  `production.footprint:manage`, `production.placement:{create,close}`.
  `layout:activate` covers the paired archive-the-previous-active transition;
  `layout:archive` is retiring an active layout WITHOUT a successor. No
  `role_permission` seeds (ADR 0004).

## Grants (schema scope)

`GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::production TO ebi_app`;
`GRANT SELECT ON SCHEMA::production TO ebi_agent_ro` (guarded; originally
issued on `produccion` by V11, re-issued on `production` by V12 — schema-scoped
grants do not survive the schema drop). V13 adds **no** new GRANT statements:
the V12 schema-level grants cover the three new tables automatically.
