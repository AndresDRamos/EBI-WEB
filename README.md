# EBI-Web — EZI Business Intelligence internal portal

Internal portal to consolidate and administer Power BI reports (with drill-through
navigation and visual embedding), growing into a data back-office (Planning modules,
EPS→EBI ETL, internal data control).

> Master architecture & decisions document: [`docs/plans/0001-portal-bootstrap.md`](docs/plans/0001-portal-bootstrap.md).
> Agent instructions (Claude Code / OpenCode): [`AGENTS.md`](AGENTS.md).

## Stack

- **App:** Next.js (App Router) + TypeScript, **pnpm** package manager.
- **Auth:** Entra ID (MSAL) — portal login (M365 SSO).
- **Power BI:** `powerbi-client-react`. Dev = org-embed (PPU); prod = app-owns-data (Fabric capacity).
- **Data:** Azure SQL (`EBI_dev` dev / `EBI` prod). **Flyway** migrations (pure SQL). Typed access with **Kysely**.
- **Deployment:** Azure App Service (Linux) + Key Vault + Managed Identity. IaC with Bicep.

## Workflow (Claude Code plans · OpenCode builds)

1. `/plan-module <name>` in Claude Code → plan in `docs/plans/`.
2. `dba` sub-agent proposes the ERD (`docs/database/erd.md`) + migrations (`db/migrations/`).
3. `flyway migrate` against `EBI_dev` and validate the schema.
4. OpenCode executes the plan (code in `src/`).
5. `/sync-docs` regenerates ERD/dictionary from the live schema.
6. `/commit-plan` (OpenCode) → atomic commits → push.

## Getting started (development)

> The Next.js scaffold happens in Milestone 1. Reference steps:

```bash
# 1) Scaffold (once), respecting this folder structure
pnpm create next-app@latest . --ts --app --tailwind --eslint --src-dir --use-pnpm

# 2) Environment variables
cp .env.example .env   # then fill in the values

# 3) Database migrations (requires Flyway installed)
flyway -configFiles=db/flyway.dev.conf migrate

# 4) Run the portal
pnpm dev               # http://localhost:3001
```

## Structure

See the full tree and rationale in
[`docs/plans/0001-portal-bootstrap.md`](docs/plans/0001-portal-bootstrap.md).

| Folder | Contents |
|---|---|
| `.claude/` | Claude Code sub-agents and commands |
| `docs/` | Plans, ADRs, database (ERD), modules, runbooks |
| `db/` | Flyway migrations and per-environment configuration |
| `src/` | Next.js application (created in Milestone 1) |

## Security

- Secrets only in `.env` (gitignored) / Azure Key Vault. **Never** in the repo.
- Database with least-privilege users (`ebi_agent_ro` / `ebi_migrator` / `ebi_app`).
- ETL **read-only** on EPS. On-prem→Azure connectivity via gateway.
