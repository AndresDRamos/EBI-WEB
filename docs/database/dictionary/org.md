# Data dictionary — schema `org`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-07 (V15). Index: [`_index.md`](_index.md).

Organization-of-the-company entities, distinct from identity (`auth`): the
canonical plant catalog, the canonical **company-wide** process catalog, and
the N:M assignment of which processes each plant runs. Created by V15, which
transferred `auth.plant` → `org.plant` and `maint.process` → `org.process`
(`ALTER SCHEMA TRANSFER`, columns unchanged) and added `org.plant_process`.
The boundary: `org` = *what the company is* (sites, processes, and how they
relate); `auth` = *who may act*. See ADR
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

Incoming cross-schema FKs: `auth.user_plant.plant_id`, `maint.asset.plant_id`,
`production.production_line.plant_id`, `production.cell.plant_id`,
`production.plant_layout.plant_id` → `org.plant.plant_id` (all no cascade;
re-pointed by `object_id` on transfer).

## `org.process`

Company-wide manufacturing process catalog (stamping, welding, laser cut, ...),
promoted from `maint.process` in V15 (columns unchanged). A single "Corte
láser" now feeds equipment (`maint.asset_process`), plants
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

Incoming cross-schema FK: `maint.asset_process.process_id` →
`org.process.process_id` (no cascade; re-pointed by `object_id` on transfer).

## `org.plant_process`

N:M link "which processes each plant runs" (V15, new). **Link-row only** — no
`is_active`, timestamps or `sort_order` — same shape as `maint.asset_process`.
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
`GRANT SELECT ON SCHEMA::org TO ebi_agent_ro` (guarded, idempotent — V15).
Schema-scoped grants do not follow transferred objects, so `org` gets its own;
`auth` / `maint` keep theirs. `ebi_migrator` owns the schema (no explicit DDL
grant, per every prior schema migration).
