# Runbook — ETL gateway (EPS → EBI)

Connectivity for the EPS→EBI ETL. EPS is on-prem (192.168.4.5); EBI is Azure SQL. The
gateway runs **inside the EZI network** and connects **outbound** to Azure — EPS is never
exposed to the internet.

## Production (Fabric Data Factory + On-premises Data Gateway)

1. Install the **On-premises Data Gateway** on an always-on host (ideally on a UPS).
2. Register the gateway with the tenant; create the EPS connection (**read-only** SQL login).
3. In **Fabric Data Factory**, build pipelines: EPS → `EBI.staging` (incremental, watermark),
   then invoke `staging → core` procedures.
4. Schedule the pipeline; enable retries and failure alerts.

## Dev

A code job (Azure Function timer or local script) reading EPS via VPN and writing `EBI_dev`
is enough to validate mappings before standing up the gateway.

## Resilience checklist

- EPS power/network loss → run fails and retries; portal stays up on last good `core`.
- On EPS return → next run recovers pending rows via watermark, no duplicates (idempotent merge).
- Gateway host: always on, UPS-backed, auto-start the gateway service.
- The ETL principal on EPS is **read-only**. Confirm it cannot write.
