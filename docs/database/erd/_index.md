# ERD — EBI database

> Generated from the live schema (read-only `ebi-sql-dev` MCP) by the `docs-sync`
> sub-agent, which runs at the end of every `/build-plan`. Do not edit by hand.
>
> Last synced: 2026-07-08. Reflects V1–V17 (V17 from the applied migration
> file V17__maint_asset_catalog_redesign.sql + regenerated Kysely types — 40
> tables — not live introspection).

El diagrama completo por esquema:

- [dbo](dbo.md) — sin tablas de aplicación desde V10 (el catálogo Power BI `report`/`report_category` fue retirado; se re-migrará cuando el feature se reconstruya).
- [etl](etl.md) — bitácora de ejecuciones ETL (`etl_run_log`).
- [auth](auth.md) — usuarios, roles, departamentos, invitaciones y el registro de navegación del portal (`nav_section`, `nav_item`, `role_nav_section`, `role_nav_item`). Desde V16 la visibilidad de navegación se autoriza POR PÁGINA (`role_nav_item`, ADR 0008); `role_nav_section` pasa a ser solo orden de secciones por rol. `plant` se movió a `org` en V15; `user_plant` sigue aquí.
- [org](org.md) — organización de la compañía (distinta de identidad): catálogo de plantas, catálogo de procesos a nivel compañía y su asignación N:M (`plant`, `process`, `plant_process`). Creado en V15 transfiriendo `auth.plant` y `maint.process`.
- [maint](maint.md) — CMMS de Mantenimiento: activos con catálogos configurables de categoría/tipo y contador de matrículas (`asset`, `asset_category`, `asset_type`, `asset_code_sequence` — los tres últimos añadidos en V17), documentos, refacciones, planes preventivos/autónomos y órdenes de trabajo (`asset_process`, `asset_restriction`, `asset_document`, `spare_part`, `maintenance_plan`, `plan_task`, `plan_material`, `work_order`, `work_order_task`, `work_order_material`, `stock_movement`). El catálogo `process` se promovió a `org` en V15; `asset_process` sigue aquí.
- [production](production.md) — estructura lógica y física de producción: líneas, celdas y el puente temporal historizado activo↔celda (`production_line`, `cell`, `asset_cell_assignment`), más los layouts de planta de V13 (`plant_layout` versionado e inmutable, `asset_footprint` una huella por activo, `asset_placement` colocación temporal historizada). Esquema creado como `produccion` en V11 y renombrado a `production` en V12.
