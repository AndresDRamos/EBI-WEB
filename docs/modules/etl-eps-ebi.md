# Module — EPS→EBI ETL

**Milestone 2.** Moves data from EPS (on-prem SQL Server, **read-only**) into Azure SQL EBI.
Owned by the `etl` sub-agent (source via `sqlserver-eps` MCP, target via `ebi-sql-dev`).

## Flow

1. Scheduled batch run wakes up.
2. Connects to EPS read-only through the **gateway** on the EZI network.
3. Extracts only new/changed rows since the last run (**watermark** by date/`rowversion`, or CDC).
4. Lands into `EBI.staging` (idempotent merge by key — reruns do not duplicate).
5. Runs `staging → core` transformation procedures (Flyway-versioned).
6. Logs the run in `etl.run_log` (rows, duration, status, watermark).
7. Portal (Kysely) and Power BI read fresh `core`.

## Dev vs prod

- **Dev:** code job (Azure Function timer / script) → `EBI_dev`. Enough to validate mappings.
- **Prod:** **Fabric Data Factory** pipelines + **On-premises Data Gateway**, scheduled,
  with retries and alerts.

## Hard rules

- **Never write to EPS.** Read-only.
- Do not expose EPS to the internet: outbound gateway/IR only.
- Resilient by design: if EPS drops, the run fails/retries; on return the watermark recovers
  pending data without duplicates. The Azure portal stays up on the last good `core` snapshot.

## Status

Planned. Detail with `/plan-module etl-eps-ebi`; define the exact EPS source tables via the
`etl` sub-agent against the `sqlserver-eps` MCP.
