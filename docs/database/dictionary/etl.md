# Data dictionary — schema `etl`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-03 (V1–V11). Index: [`_index.md`](_index.md).

Auditing and control tables for the EPS→EBI ETL pipeline.

## `etl.run_log`

One row per ETL execution per source entity. Drives incremental/watermark logic.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| run_id | bigint | no | PK, IDENTITY(1,1) | Surrogate primary key |
| entity | nvarchar(128) | no | | Source entity or mapping name (e.g. `eps.orden_produccion`) |
| started_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC run start timestamp |
| finished_at | datetime2(0) | yes | | UTC run end timestamp; NULL while status is `running` |
| status | nvarchar(20) | no | DEFAULT `running` | One of: `running`, `success`, `failed` |
| rows_loaded | int | yes | | Number of rows inserted/merged in this run |
| watermark | nvarchar(64) | yes | | Last processed watermark value (date string or rowversion hex) |
| message | nvarchar(2000) | yes | | Error message or informational note |

Indexes: `IX_etl_run_log_entity (entity, started_at DESC)`.
