# ERD — EBI database

> Generated from the live schema by `/sync-docs` (read-only `ebi-sql-dev` MCP).
> Do not edit by hand; rerun `/sync-docs` after applying migrations.
>
> Last synced: 2026-07-02. Reflects V1–V7.

El diagrama completo por esquema:

- [dbo](dbo.md) — catálogo y configuración de reportes Power BI (`report_category`, `report`).
- [etl](etl.md) — bitácora de ejecuciones ETL (`etl_run_log`).
- [auth](auth.md) — usuarios, roles, plantas, departamentos, invitaciones y el registro de navegación del portal (`nav_section`, `nav_item`, `role_nav_section`).
- [maint](maint.md) — CMMS de Mantenimiento: activos, procesos, documentos, refacciones, planes preventivos/autónomos y órdenes de trabajo (`process`, `asset`, `asset_process`, `asset_restriction`, `asset_document`, `spare_part`, `maintenance_plan`, `plan_task`, `plan_material`, `work_order`, `work_order_task`, `work_order_material`, `stock_movement`).
