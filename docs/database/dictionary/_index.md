# Data dictionary — EBI database

> Maintained by the `docs-sync` sub-agent, which runs at the end of every
> `/build-plan`. Do not edit by hand.
>
> Last synced: 2026-07-07. Reflects V1–V15 (this sync sourced from the applied
> migration file `V15` + regenerated Kysely types (`pnpm db:gen`, 36 tables),
> not live introspection; `flyway_schema_history` in `EBI_dev` reports schema
> version 15, success).
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
- `auth.role_nav_section` — role → section visibility grant with topbar priority.
- `auth.permission` — permission catalog `<module>.<resource>:<action>` (plan 0006).
- `auth.role_permission` — access profile → permission grant.

## [org](org.md)

Created in V15 by transferring `auth.plant` → `org.plant` and `maint.process`
→ `org.process` (columns unchanged) plus a new N:M link.

- `org.plant` — plant catalog managed by portal admins (moved from `auth`).
- `org.process` — company-wide manufacturing process catalog (promoted from `maint`).
- `org.plant_process` — M:N link "which processes each plant runs" (link-row only).

## [maint](maint.md)

- `maint.asset` — machine/equipment catalog; `code` is the internal tag (QR payload).
- `maint.asset_process` — M:N asset ↔ `org.process` (cross-schema since V15).
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
unchanged); plant-layout tables added in V13.

- `production.production_line` — optional sequencing container for cells.
- `production.cell` — logical production post/function; `line_id` nullable (standalone cells).
- `production.asset_cell_assignment` — temporal, historized M:N bridge asset ↔ cell (truth for where an asset works).
- `production.plant_layout` — versioned, immutable plant canvas (DXF → normalized JSON); one `active` per plant.
- `production.asset_footprint` — top-view shape per asset (one per asset, editable in place; `dxf` | `rectangle`).
- `production.asset_placement` — temporal, historized position of an asset on a layout (close + insert, never in-place).
