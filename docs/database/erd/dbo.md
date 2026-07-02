# ERD — esquema `dbo`

> Generado desde el esquema vivo (`ebi-sql-dev`, read-only). No editar a mano; lo regenera
> el sub-agente `docs-sync` al cierre de cada `/build-plan`.
>
> Última sincronización: 2026-06-28. Refleja V1 + V2 + V3 + V4.

```mermaid
erDiagram

    report_category {
        int category_id PK
        nvarchar_120 name
        int sort_order
    }

    report {
        int report_id PK
        nvarchar_200 name
        nvarchar_64 workspace_guid
        nvarchar_64 report_guid
        nvarchar_64 dataset_guid
        int category_id FK
        nvarchar_1000 description
        int sort_order
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    %% ── relaciones ──────────────────────────────────────────────────────────

    report_category ||--o{ report : "groups"
```
