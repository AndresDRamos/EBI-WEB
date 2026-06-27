# ERD — EBI database

> Generated from the live schema by `/sync-docs` (read-only `ebi-sql-dev` MCP).
> Do not edit by hand; rerun `/sync-docs` after applying migrations.
>
> Last synced: 2026-06-27. Reflects V1 + V2 + V3 + V4 (V4 pending `flyway migrate`; re-run `/sync-docs` after applying).

```mermaid
erDiagram

    %% ── dbo schema ──────────────────────────────────────────────────────────

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

    %% ── etl schema ──────────────────────────────────────────────────────────

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

    %% ── auth schema ─────────────────────────────────────────────────────────

    app_user {
        int user_id PK
        nvarchar_64 username
        nvarchar_256 email
        nvarchar_160 display_name
        nvarchar_256 password_hash
        bit all_plants
        bit is_active
        int token_version
        datetime2 created_at
        datetime2 updated_at
    }

    role {
        int role_id PK
        nvarchar_40 name
        nvarchar_256 description
        bit is_active
    }

    plant {
        int plant_id PK
        nvarchar_32 code
        nvarchar_160 name
        nvarchar_256 address
        nvarchar_16 postal_code
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    department {
        int department_id PK
        nvarchar_160 name
        nvarchar_256 description
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    user_role {
        int user_id PK,FK
        int role_id PK,FK
    }

    user_plant {
        int user_id PK,FK
        int plant_id PK,FK
    }

    user_department {
        int user_id PK,FK
        int department_id PK,FK
    }

    invitation {
        int invitation_id PK
        int user_id FK
        nvarchar_128 token_hash
        datetime2 expires_at
        datetime2 accepted_at
        int created_by FK
        datetime2 created_at
    }

    %% ── relationships ───────────────────────────────────────────────────────

    report_category ||--o{ report : "groups"

    app_user ||--o{ user_role : "assigned"
    role      ||--o{ user_role : "assigned to"

    app_user ||--o{ user_plant : "has access to"
    plant    ||--o{ user_plant : "granted to"

    app_user   ||--o{ user_department : "belongs to"
    department ||--o{ user_department : "contains"

    app_user ||--o{ invitation : "receives"
    app_user ||--o{ invitation : "issues (created_by)"
```
