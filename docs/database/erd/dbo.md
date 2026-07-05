# ERD — esquema `dbo`

> No editar a mano; lo regenera el sub-agente `docs-sync` al cierre de cada
> `/build-plan`.
>
> Última sincronización: 2026-07-03. Refleja V1 + V10.

**Sin tablas de aplicación.** `dbo.report` y `dbo.report_category` (creadas en
V1) fueron eliminadas por `V10__drop_reports_powerbi.sql` (limpieza tras el
purge de Power BI del plan portal-home-nav-authz): ambas estaban vacías y
ninguna otra tabla las referenciaba. V10 también retiró los 6 códigos
`reports.*` de `auth.permission`.

El catálogo real de Power BI (reportes + categorías, probablemente con otra
forma) se re-planeará y re-migrará cuando el feature se construya; una
migración futura define la nueva forma.
