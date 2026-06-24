# ERD — EBI database

> Generated from the live schema by `/sync-docs` (read-only `ebi-sql-dev` MCP).
> Do not edit by hand; rerun `/sync-docs` after applying migrations.

```mermaid
erDiagram
    report {
        int report_id PK
        nvarchar name
        nvarchar workspace_guid
        nvarchar report_guid
        nvarchar dataset_guid
        int category_id FK
        bit is_active
    }
    report_category {
        int category_id PK
        nvarchar name
        int sort_order
    }
    report_category ||--o{ report : groups
```

_Placeholder reflecting `V1__init.sql`. Will be regenerated from the live schema._
