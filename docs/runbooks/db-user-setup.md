# Runbook — Database users (Azure SQL)

Least-privilege **contained users** for `EBI_dev` (dev) and `EBI` (prod). Run each block
while connected to the target database.

> Status: the three dev users were already created in `EBI_dev`.

## Dev / prod (SQL auth, contained users)

```sql
-- 1) READ-ONLY — used by the DBA sub-agent's MCP (introspection + ERD). Does not write.
CREATE USER [ebi_agent_ro] WITH PASSWORD = '<strong-password>';
ALTER ROLE db_datareader ADD MEMBER [ebi_agent_ro];
GRANT VIEW DEFINITION TO [ebi_agent_ro];

-- 2) MIGRATOR — used by Flyway (dev/CI) to apply DDL. Not used by the agent MCP.
CREATE USER [ebi_migrator] WITH PASSWORD = '<strong-password>';
ALTER ROLE db_ddladmin   ADD MEMBER [ebi_migrator];
ALTER ROLE db_datawriter ADD MEMBER [ebi_migrator];
ALTER ROLE db_datareader ADD MEMBER [ebi_migrator];

-- 3) APP — used by Next.js at runtime (CRUD, no DDL).
CREATE USER [ebi_app] WITH PASSWORD = '<strong-password>';
ALTER ROLE db_datareader ADD MEMBER [ebi_app];
ALTER ROLE db_datawriter ADD MEMBER [ebi_app];
GRANT EXECUTE TO [ebi_app];
```

## Production hardening

- Prefer **Managed Identity** for the app instead of a password:

```sql
-- In EBI, with the App Service's managed identity name:
CREATE USER [<app-managed-identity>] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [<app-managed-identity>];
ALTER ROLE db_datawriter ADD MEMBER [<app-managed-identity>];
```

- Enforce `Encrypt=true` (TLS). Restrict the server firewall to known IPs / Private Endpoint.
- Passwords live only in `.env` (dev) / Key Vault (prod) — never in the repo.
