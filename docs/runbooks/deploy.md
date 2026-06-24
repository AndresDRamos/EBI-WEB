# Runbook — Deployment (Azure)

Target: Azure App Service (Linux, Node 20+) for the Next.js portal. Infra as Bicep where
possible. This runbook lists the **one-time** production setup that does not exist in dev.

## One-time provisioning

1. **App Service** (Linux plan) + optional staging slot.
2. **Azure SQL `EBI`** + firewall / Private Endpoint.
3. **Key Vault** + App Service **Managed Identity**; grant the MI access to KV secrets and a
   contained DB user (`CREATE USER [<mi>] FROM EXTERNAL PROVIDER`). See `db-user-setup.md`.
4. **Custom domain + TLS**; access restrictions (corporate network / Easy Auth).
5. **App registration:** add production redirect URIs (real URL, not `localhost`).
6. **Power BI (if capacity approved):** provision capacity, assign workspace, service
   principal + secret (in KV), tenant setting "service principals can use Power BI APIs",
   SP as workspace Member, RLS roles.
7. **ETL:** install the On-premises Data Gateway on an always-on EZI host; register it;
   create Fabric Data Factory pipelines + schedule.

## CI/CD (GitHub Actions)

- Build → `pnpm install && pnpm build`.
- DB → gated `flyway -configFiles=db/flyway.prod.conf migrate` (manual approval).
- Deploy → App Service.
- Secrets in GitHub Actions secrets / Key Vault; never in the repo.

## Plan B (no capacity)

Stay on org-embed: report viewers need Power BI Pro (included with M365 E5, else buy Pro for
BI consumers only). Intermediate option: pausable Azure PBI Embedded A1. The rest of the
portal is unaffected.
