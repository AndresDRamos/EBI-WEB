# ERD — esquema `etl`

> Generado desde el esquema vivo (`ebi-sql-dev`, read-only). No editar a mano; lo regenera
> el sub-agente `docs-sync` al cierre de cada `/build-plan`.
>
> Última sincronización: 2026-06-28. Refleja V1 + V2 + V3 + V4.

```mermaid
erDiagram

    etl_run_log {
        bigint run_id PK
        nvarchar_128 entity
        datetime2 started_at
        datetime2 finished_at
        nvarchar_20 status
        int rows_loaded
        nvarchar_64 watermark
        nvarchar_2000 message
    }
```

Este esquema no tiene relaciones declaradas con otras tablas en el ERD actual.
