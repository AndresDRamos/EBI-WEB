# Runbook — MCP setup (MSSQL)

The DBA sub-agent introspects the EBI schema through an MSSQL MCP server (read-only). The
ETL sub-agent uses the global `sqlserver-eps` MCP as its source.

Server package: **`@whmpro/mssql-mcp`** (run via `npx`, stdio). Tools: `list_tables`,
`describe_table`, `execute_query`, `get_table_data`. Read-only is enforced by the **database
user**, not the server — always point `ebi-sql-dev` at `ebi_agent_ro` (db_datareader only).

## MCP servers

- `ebi-sql-dev` → Azure SQL `EBI_dev`, user `ebi_agent_ro`. Declared in this repo:
  - Claude Code → `.mcp.json`
  - OpenCode → `opencode.json`
- `sqlserver-eps` → EPS SQL Server. Already configured **globally** for the user; no need to
  redeclare it here.

Config is declared per tool (it does not transfer between Claude Code and OpenCode), but both
files reference the same package and the `${EBI_AGENT_RO_PASSWORD}` environment variable, so
no secret lives in the repo.

## Activate `ebi-sql-dev`

1. Set the password of `ebi_agent_ro` as a user environment variable (so Claude Code's
   process can expand `${EBI_AGENT_RO_PASSWORD}`):

   ```powershell
   setx EBI_AGENT_RO_PASSWORD "the-ebi_agent_ro-password"
   ```

   `setx` persists it for future sessions. Close and reopen the terminal / Claude Code so the
   new variable is loaded.

2. Restart Claude Code in this project and approve the `ebi-sql-dev` server when prompted
   (project `.mcp.json` servers require trust approval).

3. For OpenCode, the same `EBI_AGENT_RO_PASSWORD` variable is read from `opencode.json`.

## Verify

- Ask the `dba` sub-agent to list tables in `EBI_dev`. Expected: `dbo.report`,
  `dbo.report_category`, `dbo.flyway_schema_history`, plus the `staging`/`core`/`etl` schemas.
- Ask the `etl` sub-agent to list a few EPS tables via `sqlserver-eps`.
- Both must succeed **read-only**; any write attempt must fail (the user lacks the grant).

## Note

The global `sqlserver-eps` MCP currently targets the `master` database, so `list_tables`
returns system tables. Point it (or use `execute_query` with a fully-qualified database) at
the EPS business database when wiring the real ETL — the `eps-fuentes` skill documents it.
