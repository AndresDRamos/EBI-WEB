# Migrations log

Chronological record of applied Flyway migrations. `/sync-docs` appends entries after a
successful `flyway migrate`.

| Version | File | Description | Applied (env / date) |
|---|---|---|---|
| V1 | `db/migrations/V1__init.sql` | Report metadata (`dbo.report`, `dbo.report_category`) | EBI_dev / 2026-06-24 |
| V2 | `db/migrations/V2__schemas_staging_core.sql` | `staging` + `core` + `etl` schemas and `etl.run_log` | EBI_dev / 2026-06-24 |
| V3 | `db/migrations/V3__auth_schema.sql` | Portal-owned auth RBAC (`auth` schema: `app_user`, `role`, `plant`, `department`, `user_role`, `user_plant`, `user_department`, `invitation`); seeds `admin` and `viewer` roles | EBI_dev / 2026-06-26 |
| V4 | `db/migrations/V4__user_admin_catalog_columns.sql` | User-admin catalog columns (`auth.role.is_active`; `auth.department.description`; `auth.plant.address`, `auth.plant.postal_code`) | EBI_dev / 2026-06-27 |
| V5 | `db/migrations/V5__maint_asset_catalog.sql` | Mantenimiento part 1: `maint` schema + asset catalog (`process`, `asset`, `asset_process`, `asset_restriction`, `asset_document`) — plan 0004 | EBI_dev / 2026-07-01 (verified via `ebi-sql-dev` `flyway_schema_history`) |
| V6 | `db/migrations/V6__maint_plans_workorders_spares.sql` | Mantenimiento part 2: `spare_part`, `maintenance_plan`, `plan_task`, `plan_material`, `work_order`, `work_order_task`, `work_order_material`, `stock_movement` — plan 0004 | EBI_dev / 2026-07-01 (verified via `ebi-sql-dev` `flyway_schema_history`) |
| V7 | `db/migrations/V7__nav_registry.sql` | Portal layout & navigation: `auth.nav_section`, `auth.nav_item`, `auth.role_nav_section`; seeds `dashboards` (active) and `maintenance` (inactive) sections — plan 0005 | EBI_dev / 2026-07-02 (verified via `ebi-sql-dev` `flyway_schema_history`) |
