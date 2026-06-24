# Architecture overview

High-level view of the EBI portal. Authoritative details live in
[`../plans/0001-portal-bootstrap.md`](../plans/0001-portal-bootstrap.md) and the ADRs.

## Components

```
                         ┌──────────────────────────┐
        Entra ID  ◄──────┤  Next.js portal (App      │
        (MSAL login)     │  Service, Linux)          │
                         │                           │
   User ───login───►     │  src/app  (UI + API)      │
                         │  src/lib/powerbi  (embed) │──► Power BI
                         │  src/lib/db (Kysely)      │     (PPU dev /
                         └─────────┬─────────────────┘      capacity prod)
                                   │
                          Azure SQL EBI(_dev)
                          ┌────────┴─────────┐
                          │ staging │ core   │ ◄── Flyway migrations
                          └────────▲─────────┘
                                   │ ETL (read-only)
                          Fabric Data Factory + gateway
                                   │
                          EPS (on-prem SQL Server)
```

## Key flows

- **Login:** Entra ID (MSAL) → portal session. See
  [ADR 0001](adr/0001-auth-login-entra-embed-sp.md).
- **Embedding:** dev uses the user's AAD token (`Aad`); prod uses a service-principal embed
  token (`Embed`) with RLS by UPN.
- **Data ingestion:** EPS → `staging` (read-only ETL) → `core` (Flyway procedures) →
  consumed by the portal and Power BI.

## Environments

| Concern | Development | Production |
|---|---|---|
| Database | `EBI_dev` | `EBI` |
| Power BI | org-embed (PPU) | app-owns-data (capacity) |
| DB auth (app) | SQL user `ebi_app` | Managed Identity |
| ETL | code job / Function | Fabric Data Factory + gateway |
| Secrets | `.env` (gitignored) | Azure Key Vault |
