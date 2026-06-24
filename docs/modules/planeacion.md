# Module — Planning

**Milestone 2.** First data module beyond Power BI. Real CRUD that exercises the full data
machinery (data layer, Flyway migrations, living ERD, DBA/ETL sub-agents) and closes the
loop: capture in the portal → Azure SQL → Power BI model → embed in the same portal.

## Scope (to be detailed via `/plan-module planeacion`)

- Planning capture/edit UI (`src/app/(portal)/planeacion`).
- `core`/`planeacion` schema tables fed partly by user input and partly by the EPS ETL.
- Validations and, in production, RLS by UPN.

## Dependencies

- `staging`/`core` schemas (`V2__schemas_staging_core.sql`).
- EPS→EBI ETL — see [`etl-eps-ebi.md`](etl-eps-ebi.md).

## Status

Planned. Detail this module with `/plan-module planeacion` before building.
