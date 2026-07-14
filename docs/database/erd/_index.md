# ERD — EBI database

> Generated from the live schema (read-only `ebi-sql-dev` MCP) by the `docs-sync`
> sub-agent, which runs at the end of every `/build-plan`. Do not edit by hand.
>
> Last synced: 2026-07-14. Reflects V1–V20 (V18 from the adopted-from-live
> migration file V18__org_locations_type_processes.sql + regenerated Kysely
> types, not direct introspection; V19 from the applied migration file
> V19__production_operative_cells.sql + regenerated Kysely types; V20 from the
> applied migration file V20__laser_cut_sequencing.sql + regenerated Kysely
> types).

El diagrama completo por esquema:

- [dbo](dbo.md) — sin tablas de aplicación desde V10 (el catálogo Power BI `report`/`report_category` fue retirado; se re-migrará cuando el feature se reconstruya).
- [etl](etl.md) — bitácora de ejecuciones ETL (`etl_run_log`). Desde V20 el ETL on-prem de corte láser escribe una fila por entidad `staging.eps_*`.
- [staging](staging.md) — réplica fiel del dominio de corte láser de EPS, aterrizada por el ETL (V20, primeras tablas del esquema): `eps_nesting`, `eps_nesting_detail`, `eps_nesting_plan`, `eps_cutting_station`, `eps_part_route_step` (claves naturales de EPS, sin identity, sin FKs; solo el ETL escribe, el portal lee).
- [planning](planning.md) — esquema propiedad del portal (V20, nacido en este plan): programas de secuenciación láser por celda (`machine_program`, `machine_program_entry`) y el mapeo 1:1 celda EBI ↔ estación EPS (`cell_station_link`); FKs cruzadas a `production.cell` y `auth.app_user`.
- [auth](auth.md) — usuarios, roles, departamentos, invitaciones y el registro de navegación del portal (`nav_section`, `nav_item`, `role_nav_section`, `role_nav_item`). Desde V16 la visibilidad de navegación se autoriza POR PÁGINA (`role_nav_item`, ADR 0008); `role_nav_section` pasa a ser solo orden de secciones por rol. `plant` se movió a `org` en V15; `user_plant` sigue aquí.
- [org](org.md) — organización de la compañía (distinta de identidad): catálogo de plantas, ubicaciones con nombre dentro de cada planta (`location`, V18), catálogo de procesos a nivel compañía y su asignación N:M (`plant`, `location`, `process`, `plant_process`). Creado en V15 transfiriendo `auth.plant` y `maint.process`.
- [maint](maint.md) — CMMS de Mantenimiento: activos con catálogos configurables de categoría/tipo y contador de matrículas (`asset`, `asset_category`, `asset_type`, `asset_code_sequence`), documentos, refacciones, planes preventivos/autónomos y órdenes de trabajo (`asset_type_process`, `asset_restriction`, `asset_document`, `spare_part`, `maintenance_plan`, `plan_task`, `plan_material`, `work_order`, `work_order_task`, `work_order_material`, `stock_movement`). El catálogo `process` se promovió a `org` en V15; V18 sustituyó `asset_process` (por activo) por `asset_type_process` (por tipo), movió el prefijo de matrícula categoría → tipo y ancló el activo a `org.location` (`asset.location_id`, planta derivada).
- [production](production.md) — estructura física y lógica de producción: celdas operativas en una jerarquía autorreferenciada de profundidad máxima 1 (`cell`, con `location_id` obligatorio a `org.location` desde V19 — la planta se deriva —, `parent_cell_id`, `process_id` opcional a `org.process`, código autogenerado vía `cell_code_sequence`) y el puente temporal historizado activo↔celda (`asset_cell_assignment`, desde V19 también valida que el tipo del activo soporte el proceso de la celda), más los layouts de planta de V13 (`plant_layout` versionado e inmutable, `asset_footprint` una huella por activo, `asset_placement` colocación temporal historizada). Esquema creado como `produccion` en V11, renombrado a `production` en V12; V19 colapsó `production_line` + `cell` en una sola entidad (`production_line` eliminada).
