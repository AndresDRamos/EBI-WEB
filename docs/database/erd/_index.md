# ERD — EBI database

> Generated from the live schema (read-only `ebi-sql-dev` MCP) by the `docs-sync`
> sub-agent, which runs at the end of every `/build-plan`. Do not edit by hand.
>
> Last synced: 2026-07-06. Reflects V1–V13 (this sync from the applied migration
> file V13 + regenerated Kysely types, not live introspection;
> `flyway_schema_history` in `EBI_dev` reports schema version 13, success).

El diagrama completo por esquema:

- [dbo](dbo.md) — sin tablas de aplicación desde V10 (el catálogo Power BI `report`/`report_category` fue retirado; se re-migrará cuando el feature se reconstruya).
- [etl](etl.md) — bitácora de ejecuciones ETL (`etl_run_log`).
- [auth](auth.md) — usuarios, roles, plantas, departamentos, invitaciones y el registro de navegación del portal (`nav_section`, `nav_item`, `role_nav_section`).
- [maint](maint.md) — CMMS de Mantenimiento: activos, procesos, documentos, refacciones, planes preventivos/autónomos y órdenes de trabajo (`process`, `asset`, `asset_process`, `asset_restriction`, `asset_document`, `spare_part`, `maintenance_plan`, `plan_task`, `plan_material`, `work_order`, `work_order_task`, `work_order_material`, `stock_movement`).
- [production](production.md) — estructura lógica y física de producción: líneas, celdas y el puente temporal historizado activo↔celda (`production_line`, `cell`, `asset_cell_assignment`), más los layouts de planta de V13 (`plant_layout` versionado e inmutable, `asset_footprint` una huella por activo, `asset_placement` colocación temporal historizada). Esquema creado como `produccion` en V11 y renombrado a `production` en V12.
