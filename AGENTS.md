# AGENTS.md — Instructions for agents (EBI-Web)

> **Single source of truth** for Claude Code and OpenCode. Claude Code loads it via
> `@AGENTS.md` from `CLAUDE.md`; OpenCode reads it natively. Do not duplicate these rules
> in other files: link here.

## What this project is

Internal **EBI** portal (EZI Business Intelligence): administers Power BI reports
(embedding + drill-through) and grows toward data modules (Planning, EPS→EBI ETL,
internal data control). Master plan: `docs/plans/0001-portal-bootstrap.md`.

## Agent roles

- **Claude Code = planner.** Designs architecture, modules, ERD and migrations (in plan
  mode). Produces plans in `docs/plans/` and ADRs in `docs/architecture/adr/`.
- **OpenCode = executor.** Builds the code of the approved plan and assembles the commits.

Goal of the split: diversify token consumption per session.

## Stack and conventions

- **App:** Next.js (App Router) + TypeScript. Package manager **pnpm** (never npm/yarn).
- **Styling:** Tailwind + shadcn/ui. EZI identity: charcoal gray `#373a36`, orange
  `#ff5c35`, Montserrat typeface, minimalist industrial aesthetic.
- **Auth:** **portal-owned credentials** (username/password, Auth.js v5) for portal login;
  design stays open to add Entra SSO later. See
  `docs/architecture/adr/0001-portal-owned-auth.md`.
- **Power BI:** `powerbi-client-react`. The `src/lib/powerbi/` layer is **mode-agnostic**
  (`tokenType: Aad` in dev/PPU; `tokenType: Embed` in prod/capacity). Do not fork the embed
  component: fork only the token acquisition.
- **Data:** Azure SQL. Typed access with **Kysely** (`src/lib/db/`). Types generated with
  `kysely-codegen`. No raw untyped queries outside `src/lib/db/`.
- **Migrations:** **Flyway**, pure versioned SQL in `db/migrations/`
  (`V{n}__{desc}.sql` incremental, `R__{desc}.sql` repeatable). They are **written by the
  DBA sub-agent**; a human runs `flyway migrate` and validates.

## Hard rules (non-negotiable)

1. **Secrets never in the repo.** Only in `.env` (gitignored) or Azure Key Vault. If you
   need a secret value, reference it by environment variable name.
2. **Least privilege in the database.** Use the right user per task:
   - `ebi_agent_ro` → read-only (MCP introspection/ERD).
   - `ebi_migrator` → DDL via Flyway.
   - `ebi_app` → CRUD at app runtime.
3. **The ETL is READ-ONLY on EPS.** Never write to the EPS manufacturing database.
4. **Do not touch production without going through dev.** Migrations and changes are
   validated in `EBI_dev` before `EBI`.
5. **Do not reintroduce "Publish to web".** The authenticated portal replaces the public URLs.

## Data schemas (medallion pattern)

- `staging` → faithful copy of EPS landed by the ETL (only the ETL writes it).
- `core` / `planeacion` → transformed data consumed by the portal and Power BI.
- `staging → core` transformations = procedures/SQL versioned with Flyway.

## Available MCPs

- `ebi-sql-dev` → Azure SQL `EBI_dev` with `ebi_agent_ro` (read-only). Used by the DBA.
- `sqlserver-eps` → EPS SQL Server (read-only). Used by the ETL sub-agent as the source.

## Standard workflow

1. `/plan-module <name>` → plan in `docs/plans/NNNN-*.md`.
2. `dba` sub-agent → ERD (`docs/database/erd.md`) + migrations (`db/migrations/`).
3. Human: `flyway -configFiles=db/flyway.dev.conf migrate` → validate schema.
4. Agent executes the plan (code in `src/`).
5. `/sync-docs` → regenerates ERD/dictionary from the live schema (does not document
   fallback logic unless strictly necessary).
6. `/commit-plan` → atomic commits → push.

## Verify before calling something done

- `pnpm lint && pnpm build` must pass.
- Schema changes: clean `flyway info` and `/sync-docs` executed.
- Report faithfully: if something fails or was skipped, say so with the real output.

## Documentation

- Plans: `docs/plans/` (`_template.md` template). Permanent decisions: ADRs in
  `docs/architecture/adr/`. A plan may produce one or more ADRs.
- Modules: `docs/modules/`. Operational runbooks: `docs/runbooks/`.
