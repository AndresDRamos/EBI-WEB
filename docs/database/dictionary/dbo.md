# Data dictionary — schema `dbo`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-03 (V1–V11). Index: [`_index.md`](_index.md).

No application tables. `dbo.report` and `dbo.report_category` (V1) were dropped
by `V10__drop_reports_powerbi.sql` (Power BI purge cleanup; both were empty and
unreferenced). The real Power BI catalog will be re-planned and re-migrated when
the feature is rebuilt.
