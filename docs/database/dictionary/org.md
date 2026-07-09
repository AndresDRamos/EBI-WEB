# Data dictionary — schema `org`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-08 (V15 + V18; V18 sourced from the adopted-from-live
> migration file `V18__org_locations_type_processes.sql` + regenerated Kysely
> types, not direct introspection). Index: [`_index.md`](_index.md).

Organization-of-the-company entities, distinct from identity (`auth`): the
canonical plant catalog, named locations within each plant (V18), the
canonical **company-wide** process catalog, and the N:M assignment of which
processes each plant runs. Created by V15, which transferred `auth.plant` →
`org.plant` and `maint.process` → `org.process` (`ALTER SCHEMA TRANSFER`,
columns unchanged) and added `org.plant_process`; V18 added `org.location`.
The boundary: `org` = *what the company is* (sites, locations, processes, and
how they relate); `auth` = *who may act*. See ADR
`docs/architecture/adr/0007-org-schema-identity-vs-organization.md`,
`docs/database/erd/org.md`.

## `org.plant`

Plant catalog managed by portal admins (transferred from `auth` in V15,
columns unchanged). May later map to EPS plant IDs.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| plant_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short plant code |
| name | nvarchar(160) | no | | Full plant name |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |
| address | nvarchar(256) | yes | | Optional street address (added V4) |
| postal_code | nvarchar(16) | yes | | Optional postal/ZIP code (added V4) |

Incoming cross-schema FKs: `auth.user_plant.plant_id`,
`maint.asset_code_sequence.plant_id`, `production.plant_layout.plant_id` →
`org.plant.plant_id` (all no cascade). `maint.asset.plant_id` was dropped in
V18 — an asset's plant is now derived via `org.location`.
`production.cell.plant_id` and `production.production_line.plant_id` are
likewise gone since V19 — `production.production_line` was dropped and a
cell's plant is now derived via `production.cell.location_id → org.plant`
(see [production.md](production.md)).

## `org.location`

Named locations **within** a plant ("Nave 2", "Almacén MP"), added by V18
(plan machines-locations-view). The anchor for physical location:
`maint.asset.location_id` (NOT NULL — the asset's plant is derived through
it) and `production.cell.location_id` (NOT NULL since V19; was NULLable in
V18) both point here. Administered from the admin panel's Plantas tab
(Planta → Ubicaciones grouped table).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| location_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| plant_id | int | no | FK → org.plant (no cascade), UQ with code | Owning plant |
| code | nvarchar(32) | no | UQ with plant_id (`UQ_location_plant_code`) | Short location code, unique per plant |
| name | nvarchar(160) | no | | Location name |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp (app-maintained) |

`UQ_location_plant_code (plant_id, code)` doubles as the FK-support index for
`plant_id` (leading column). Incoming cross-schema FKs:
`maint.asset.location_id` (NOT NULL, V18) and `production.cell.location_id`
(NULLable, V18) → `org.location.location_id`, both no cascade. The invariant
"an asset's cell assignment requires the cell and the asset to share the same
location" is enforced by the app (422), not the DB.

V18 seeds 3 `auth.permission` codes: `org.location:{create,update,delete}`.
No `role_permission` rows (admin bypasses at the app layer, ADR 0004) and no
nav item (location admin lives inside the existing admin Plantas page).

## `org.process`

Company-wide manufacturing process catalog (stamping, welding, laser cut, ...),
promoted from `maint.process` in V15 (columns unchanged). A single "Corte
láser" now feeds equipment types (`maint.asset_type_process` since V18), plants
(`org.plant_process`) and the future process route, instead of a
maintenance-only list.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| process_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short process code |
| name | nvarchar(160) | no | | Process name |
| description | nvarchar(512) | yes | | Optional description |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Incoming cross-schema FK: `maint.asset_type_process.process_id` →
`org.process.process_id` (no cascade; V18 — replaced the per-asset
`maint.asset_process.process_id`, table dropped in V18).

## `org.plant_process`

N:M link "which processes each plant runs" (V15, new). **Link-row only** — no
`is_active`, timestamps or `sort_order` — same shape as `maint.asset_type_process`.
A `process_id` repeats freely across plants; unassignment = DELETE the row
(nothing references it downstream). Both FKs are `NO ACTION` to protect the
`org.plant` / `org.process` catalogs (the app 409s on a referenced row).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| plant_id | int | no | PK, FK → org.plant (no cascade) | Plant reference |
| process_id | int | no | PK, FK → org.process (no cascade) | Process reference |

Indexes: `IX_plant_process_process (process_id)` (reverse lookup "which plants
run process X"; the forward lookup is served by the leading PK column
`plant_id`).

## Grants (schema scope)

`GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::org TO ebi_app`;
`GRANT SELECT ON SCHEMA::org TO ebi_agent_ro` (guarded, idempotent — V15,
re-issued by V18; the schema-scope grants cover `org.location` automatically).
Schema-scoped grants do not follow transferred objects, so `org` gets its own;
`auth` / `maint` keep theirs. `ebi_migrator` owns the schema (no explicit DDL
grant, per every prior schema migration).
