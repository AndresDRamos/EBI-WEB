# 0001 — EBI internal portal bootstrap

- **Status:** Approved — 2026-06-24
- **Author:** EBI team
- **Related ADRs:** [0001 — Portal-owned auth; Power BI deferred](../architecture/adr/0001-portal-owned-auth.md)

## Context

Power BI dashboards are currently distributed as public "Publish to web" URLs emailed to
contacts — anonymous, search-indexable, with no access control or telemetry: a security
risk and a capability ceiling. The goal is an **authenticated internal portal** that:

1. Consolidates and administers Power BI reports, with **cross-report drill-through
   navigation** and composition of **individual visuals from independent reports**.
2. Grows into a **data back-office**: create/edit internal data against Azure SQL
   (`EBI_dev` in development, `EBI` in production), with **versioned SQL migrations** and a
   **living ERD** assisted by a DBA sub-agent with MCP.
3. Runs under a **Claude Code = planner / OpenCode = executor** workflow, with
   documentation synchronized from the real schema.

Outcome: replace the public URLs with a secure Next.js portal, scalable to planning and
production modules, deployed on Azure.

## Confirmed decisions

| Topic | Decision |
|---|---|
| Embedding strategy | Phase 1 org-embed → later capacity (reuse delegated app, migrate to capacity at scale) |
| App stack | Next.js full-stack (App Router) + TypeScript + pnpm |
| Prod database | Production is named `EBI`; development `EBI_dev` |
| Fabric capacity | Optional, not a requirement. Only enables app-owns-data. Plan B: permanent org-embed with Pro |
| Migrations / data | Flyway (pure SQL) + typed Kysely; Mermaid ERD |
| Licensing | Dev with owner PPU (org-embed); production assumes reserved Fabric capacity (app-owns-data) |
| Portal login | Entra ID (MSAL) SSO in both phases. In prod it stops issuing the embed token (the service principal does); the UPN feeds RLS |
| Plan versioning | `docs/plans/` with `NNNN-slug.md` template + ADRs for permanent decisions |
| EPS→EBI ETL | Fabric Data Factory + On-premises Data Gateway. Read-only on EPS |
| Modules | Beyond Power BI: first data module = Planning, fed by ETL from EPS |

## Scope / out of scope

- In scope: workflow foundations (Milestone 0), Power BI report admin (Milestone 1),
  Planning + ETL module (Milestone 2), production/app-owns-data (Milestone 3).
- Out of scope: purchasing the Fabric capacity (presented to leadership), real-time data.

## Design

### Licensing & embedding

- **Development / leadership demo:** owner **PPU** with **org-embed** (user owns data),
  reusing the existing delegated app (`Report.Read.All` + MSAL `localhost:3001`). No extra cost.
- **Production:** assumes a **reserved Fabric capacity** → **app-owns-data** with a service
  principal: viewers need **no individual license**, full embedded capabilities (individual
  visuals from independent reports, custom layouts, RLS). Portal login stays Entra SSO;
  the service principal only generates the embed token.
- **Mode-agnostic design:** `src/lib/powerbi/` supports both `tokenType` (`Aad` dev/PPU,
  `Embed` prod/capacity) so going to production is configuration, not a rewrite.

### Architecture

- **Frontend/Backend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. pnpm.
  EZI identity (charcoal `#373a36`, orange `#ff5c35`, Montserrat, minimalist industrial).
- **Auth (portal login):** Entra ID via `@azure/msal-browser` + `@azure/msal-react`
  (M365 SSO, MFA/conditional access, automatic offboarding). Entra groups → RBAC.
  See ADR 0001 for the login-vs-embed-token decoupling.
- **Power BI:** `powerbi-client-react`; native cross-report drill-through + portal-level
  navigation (`report.setPage`, bookmarks, filters).
- **Data:** Azure SQL `EBI_dev` (dev) / `EBI` (prod). Flyway migrations. Typed Kysely
  (`kysely-codegen`). Mermaid ERD generated from the live schema.
- **Deployment:** Azure App Service (Linux, Node 20+). Secrets in Azure Key Vault; prod
  uses Managed Identity for KV and SQL. CI/CD with GitHub Actions (build → gated Flyway
  migrate → deploy). Production infra as Bicep (IaC) + runbook.

### Data schemas (medallion)

- `staging` — faithful copy of needed EPS tables landed by the ETL (only the ETL writes it).
- `core` / `planeacion` — transformed data consumed by the portal and Power BI.
- `staging → core` transformations are Flyway-versioned procedures.

### Dual agent flow

- Single source of truth in `AGENTS.md` (OpenCode native; `CLAUDE.md` imports it).
- MCP declared twice (`.mcp.json` for Claude, `opencode.json` for OpenCode): the config
  does not transfer between tools.
- Sub-agents: `architect`, `dba`, `etl`, `pbi-embed`, `docs-sync`.
- Commands: `/plan-module`, `/sync-docs`, `/commit-plan`, `/save-plan`.

## Per-file changes

See the repository tree in the README. Milestone 0 creates: `AGENTS.md`, `CLAUDE.md`,
`.mcp.json.example`, `opencode.json.example`, `.claude/agents/*`, `.claude/commands/*`,
`.claude/settings.json`, `docs/**`, `db/migrations/V1__init.sql`,
`db/migrations/V2__schemas_staging_core.sql`, `db/flyway.*.conf`.

## Migrations / ERD

- `V1__init.sql` — report metadata for the admin module (`dbo.report`, categories/nav).
- `V2__schemas_staging_core.sql` — `staging` and `core` schemas + `etl.run_log`.
- ERD and data dictionary regenerated via `/sync-docs` after each migration.

## Roadmap / milestones

- **Milestone 0 — Foundations:** Next.js scaffold; `AGENTS.md`/`CLAUDE.md`; MCP config
  (`ebi-sql-dev` + `sqlserver-eps`); sub-agents + commands; `docs/plans/` with `_template.md`;
  DB users (`ro`/`migrator`/`app`) + firewall; `.env.example`; Flyway `V1__init.sql`;
  MCP verified (DBA lists `EBI_dev` tables, ETL reads EPS read-only).
- **Milestone 1 — Report admin (org-embed):** MSAL login; dashboard list (metadata in
  `EBI_dev`); embedded report + individual visuals; drill-through navigation; report admin
  CRUD. Replaces the public URLs.
- **Milestone 2 — Planning module + EPS→EBI ETL:** `staging`/`core` schemas; EPS→`staging`
  ETL (dev: code job/Function; prod: Fabric Data Factory + gateway); `staging → core`
  procedures; planning capture/edit UI; ERD/dictionary updated via `/sync-docs`.
- **Milestone 3 — Production / app-owns-data:** with the reserved Fabric capacity, add the
  service principal + tenant setting + SP in workspace; `/api/embed-token` (`tokenType:
  Embed`); license-less viewers; visual composition; RLS by UPN. Move the ETL to Fabric DF.
- **Milestone 4+ —** More data modules (cross-process planning, internal production data).

## Verification

1. **Portal:** `pnpm dev` → `localhost:3001`; MSAL login; embed a real report + a single
   visual; test drill-through navigation between two reports.
2. **MCP:** ask `dba` to list `EBI_dev` tables (read-only `ebi_agent_ro`) and `etl` to list
   EPS tables via `sqlserver-eps` (read-only).
3. **Migrations:** `flyway info` and `flyway migrate` against `EBI_dev` (`ebi_migrator`);
   then `/sync-docs` and confirm `erd.md` reflects the schema.
4. **ETL (Planning):** run the ETL into `staging`, execute `staging → core` procedures and
   confirm data in the portal's Planning module (EPS untouched).
5. **Build/CI:** `pnpm lint && pnpm build`; test commit with `/commit-plan`.

## Risks / notes

- **Capacity is not a portal requirement.** The portal runs without it; capacity only
  enables app-owns-data. Plan B: permanent org-embed with Power BI Pro (included if EZI has
  M365 E5), or pausable Azure PBI Embedded A1.
- **ETL resilience:** if EPS power/network drops, the Azure portal stays up (data already in
  `EBI.core`); only the refresh pauses. The ETL is batch + incremental (watermark) +
  idempotent with retries/alerts; on EPS return the next run recovers pending data. Keep the
  gateway host always on (UPS). Trade-off: batch latency.
- **Security:** disable "Publish to web" once live; least-privilege DB users; secrets only in
  `.env`/Key Vault; ETL read-only on EPS via outbound gateway.
