# Data dictionary — EBI database

> Maintained by the `docs-sync` sub-agent, which runs at the end of every
> `/build-plan`. Do not edit by hand.
>
> Last synced: 2026-07-09. Reflects V1–V19 (V18 sourced from the
> adopted-from-live migration file `V18__org_locations_type_processes.sql` +
> regenerated Kysely types, not direct introspection; V19 sourced from the
> applied migration file `V19__production_operative_cells.sql` +
> regenerated Kysely types).
>
> **How to read:** find the table below, then open only its schema page —
> never read the whole folder. One page per schema, mirroring
> [`../erd/_index.md`](../erd/_index.md).

## [dbo](dbo.md)

No application tables since V10 (Power BI catalog dropped; will be re-migrated
when the feature is rebuilt).

## [etl](etl.md)

- `etl.run_log` — one row per ETL execution per source entity; drives incremental/watermark logic.

## [auth](auth.md)

- `auth.app_user` — portal user accounts; login identity is `username`.
- `auth.role` — RBAC role catalog; since V8 a role = access profile (ADR 0004), optionally department-scoped.
- `auth.department` — department catalog managed by portal admins. (`plant` moved to `org` in V15.)
- `auth.user_role` — M:N user ↔ role.
- `auth.user_plant` — M:N user ↔ plant (ignored when `all_plants = 1`).
- `auth.user_department` — M:N user ↔ department.
- `auth.invitation` — one-time tokens to activate pre-created inactive accounts.
- `auth.nav_section` — topbar sections of the portal nav registry.
- `auth.nav_item` — sidebar entries per section (one-level nesting).
- `auth.role_nav_section` — role → section **order** in the topbar (since V16 order only, no longer a grant — ADR 0008).
- `auth.role_nav_item` — role → **page** visibility grant + intra-section order (V16, ADR 0008; source of truth for nav authorization).
- `auth.permission` — permission catalog `<module>.<resource>:<action>` (plan 0006).
- `auth.role_permission` — access profile → permission grant.

## [org](org.md)

Created in V15 by transferring `auth.plant` → `org.plant` and `maint.process`
→ `org.process` (columns unchanged) plus a new N:M link; `org.location` added
in V18.

- `org.plant` — plant catalog managed by portal admins (moved from `auth`).
- `org.location` — named locations within a plant (V18); anchor for asset/cell physical location.
- `org.process` — company-wide manufacturing process catalog (promoted from `maint`).
- `org.plant_process` — M:N link "which processes each plant runs" (link-row only).

## [maint](maint.md)

- `maint.asset` — machine/equipment catalog; `code` is the app-generated matrícula (QR payload) since V17; category derived via `asset_type`, plant derived via `org.location` (V18).
- `maint.asset_category` — configurable asset-category catalog (V17; `code_prefix` moved to `asset_type` in V18).
- `maint.asset_type` — machine types grouped under a category; `code` unique per category (V17); owns the matrícula `code_prefix` and the process links since V18.
- `maint.asset_type_process` — M:N type ↔ `org.process` (V18; replaces the per-asset `asset_process`, dropped).
- `maint.asset_code_sequence` — race-safe per (type, plant) counter backing the matrícula (V17, re-keyed in V18).
- `maint.asset_restriction` — operational/safety limitations per asset.
- `maint.asset_document` — document metadata; bytes live in Azure Blob Storage.
- `maint.spare_part` — spare-part catalog (single maintenance warehouse in v1).
- `maint.maintenance_plan` — preventive/autonomous plan per asset (calendar-based v1).
- `maint.plan_task` — ordered checklist template of a plan.
- `maint.plan_material` — planned spare-part consumption per plan execution.
- `maint.work_order` — execution record; source of the maintenance calendar.
- `maint.work_order_task` — immutable snapshot of plan tasks at WO creation.
- `maint.work_order_material` — actual spare-part consumption per WO.
- `maint.stock_movement` — append-only signed stock ledger (truth for current stock).

## [production](production.md)

Created as `produccion` in V11; renamed to `production` in V12 (structure
unchanged); plant-layout tables added in V13; the line/cell two-level model
was collapsed into a single self-referencing `cell` in V19
(`production.production_line` dropped).

- `production.cell` — logical production post/function, a self-referencing hierarchy capped at depth 1 (V19); `location_id` NOT NULL → `org.location` (plant derived through it); optional `parent_cell_id`, `process_id` → `org.process`.
- `production.cell_code_sequence` — race-safe per-location counter backing the app-generated cell code (V19).
- `production.asset_cell_assignment` — temporal, historized M:N bridge asset ↔ cell (truth for where an asset works); since V19 also gated by the cell's declared process vs. the asset type's supported processes.
- `production.plant_layout` — versioned, immutable plant canvas (DXF → normalized JSON); one `active` per plant.
- `production.asset_footprint` — top-view shape per asset (one per asset, editable in place; `dxf` | `rectangle`).
- `production.asset_placement` — temporal, historized position of an asset on a layout (close + insert, never in-place).
