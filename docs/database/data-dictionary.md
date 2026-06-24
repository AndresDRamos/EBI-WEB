# Data dictionary — EBI database

> Generated from the live schema by `/sync-docs` (read-only `ebi-sql-dev` MCP).
> Do not edit by hand; rerun `/sync-docs` after applying migrations.

## schema `dbo`

### `dbo.report`

| Column | Type | Null | Description |
|---|---|---|---|
| report_id | int (identity) | no | Primary key |
| name | nvarchar(200) | no | Display name in the portal |
| workspace_guid | nvarchar(64) | no | Power BI workspace id |
| report_guid | nvarchar(64) | no | Power BI report id |
| dataset_guid | nvarchar(64) | yes | Power BI dataset id |
| category_id | int | yes | FK → `report_category` |
| description | nvarchar(1000) | yes | Optional description |
| sort_order | int | no | Ordering within category |
| is_active | bit | no | Whether it is shown |
| created_at | datetime2 | no | Creation timestamp |
| updated_at | datetime2 | no | Last update timestamp |

### `dbo.report_category`

| Column | Type | Null | Description |
|---|---|---|---|
| category_id | int (identity) | no | Primary key |
| name | nvarchar(120) | no | Category name |
| sort_order | int | no | Display order |

_Placeholder reflecting `V1__init.sql`. Will be regenerated from the live schema._
