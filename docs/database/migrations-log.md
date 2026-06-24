# Migrations log

Chronological record of applied Flyway migrations. `/sync-docs` appends entries after a
successful `flyway migrate`.

| Version | File | Description | Applied (env / date) |
|---|---|---|---|
| V1 | `db/migrations/V1__init.sql` | Report metadata (`dbo.report`, `dbo.report_category`) | EBI_dev / 2026-06-24 |
| V2 | `db/migrations/V2__schemas_staging_core.sql` | `staging` + `core` schemas and `etl.run_log` | EBI_dev / 2026-06-24 |
