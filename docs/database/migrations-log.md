# Migrations log

Chronological record of applied Flyway migrations. `/ship-module` or `/plan-module`
registers each plan's migrations here on approval and applies them to `EBI_dev`; the
`docs-sync` sub-agent reconciles after a successful `flyway migrate`.

| Version | File | Description | Applied (env / date) |
|---|---|---|---|
| V1 | `db/migrations/V1__init.sql` | Report metadata (`dbo.report`, `dbo.report_category`) | EBI_dev / 2026-06-24 |
| V2 | `db/migrations/V2__schemas_staging_core.sql` | `staging` + `core` + `etl` schemas and `etl.run_log` | EBI_dev / 2026-06-24 |
| V3 | `db/migrations/V3__auth_schema.sql` | Portal-owned auth RBAC (`auth` schema: `app_user`, `role`, `plant`, `department`, `user_role`, `user_plant`, `user_department`, `invitation`); seeds `admin` and `viewer` roles | EBI_dev / 2026-06-26 |
| V4 | `db/migrations/V4__user_admin_catalog_columns.sql` | User-admin catalog columns (`auth.role.is_active`; `auth.department.description`; `auth.plant.address`, `auth.plant.postal_code`) | EBI_dev / 2026-06-27 |
| V5 | `db/migrations/V5__maint_asset_catalog.sql` | Mantenimiento part 1: `maint` schema + asset catalog (`process`, `asset`, `asset_process`, `asset_restriction`, `asset_document`) — plan 0004 | EBI_dev / 2026-07-01 (verified via `ebi-sql-dev` `flyway_schema_history`) |
| V6 | `db/migrations/V6__maint_plans_workorders_spares.sql` | Mantenimiento part 2: `spare_part`, `maintenance_plan`, `plan_task`, `plan_material`, `work_order`, `work_order_task`, `work_order_material`, `stock_movement` — plan 0004 | EBI_dev / 2026-07-01 (verified via `ebi-sql-dev` `flyway_schema_history`) |
| V7 | `db/migrations/V7__nav_registry.sql` | Portal layout & navigation: `auth.nav_section`, `auth.nav_item`, `auth.role_nav_section`; seeds `dashboards` (active) and `maintenance` (inactive) sections — plan 0005 | EBI_dev / 2026-07-02 (verified via `ebi-sql-dev` `flyway_schema_history`) |
| V8 | `db/migrations/V8__rbac_permissions.sql` | Resource+action RBAC: `auth.role.department_id` (access-profile semantics), `auth.permission` (35 seeded codes `<module>.<resource>:<action>`), `auth.role_permission` (ships empty) — plan 0006 | EBI_dev / 2026-07-02 (verified via `ebi-sql-dev` `flyway_schema_history`) |
| V9 | `db/migrations/V9__maintenance_nav_items.sql` | Maintenance nav items (blueprint retrofit): idempotent seed of `auth.nav_item` rows `Máquinas → /maintenance/machines` and `Procesos → /maintenance/process`; data-only, no DDL — plan portal-home-nav-authz | EBI_dev / 2026-07-03 (user-confirmed `flyway migrate` + `pnpm db:gen`; not independently verified via `flyway_schema_history` — `ebi-sql-dev` MCP offline this session) |
| V10 | `db/migrations/V10__drop_reports_powerbi.sql` | Power BI purge cleanup: DROP `dbo.report` + `dbo.report_category` (both empty; `dbo` left with no portal tables) and DELETE the 6 inert `auth.permission` `reports.%` codes (0 grants) — plan portal-home-nav-authz. **Irreversible** (DROP TABLE). Run `pnpm db:gen` after apply | applied: false |
