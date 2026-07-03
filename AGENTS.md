# AGENTS.md — Instructions for agents (EBI-Web)

> **Single source of truth** for Claude Code and OpenCode. Claude Code loads it via
> `@AGENTS.md` from `CLAUDE.md`; OpenCode reads it natively. Do not duplicate these rules
> in other files: link here.

## What this project is

Internal **EBI** portal (EZI Business Intelligence): administers Power BI reports
(embedding + drill-through) and grows toward data modules (Planning, EPS→EBI ETL,
internal data control). Current truth: `docs/STATE.md`; module recipe:
`docs/architecture/module-blueprint.md`; plan ledger: `docs/plans/README.md`.

## Agent roles

Two lanes:

- **Fast lane (`/ship-module`)** — one session plans, and on approval builds and
  verifies in a single continuous pass. Default for small-to-medium changes; no
  `prompts/` file needed (the chat ask is the input).
- **Full lane (planner/executor split)** — for large plans, destructive migrations, or
  session handoff:
  - **Planner** (Claude Code). Designs architecture, modules, ERD and migrations (in
    plan mode); on approval persists the plan and applies its dev migrations. Produces
    plans in `docs/plans/` and ADRs in `docs/architecture/adr/`.
  - **Executor** — whichever agent runs `/build-plan` on the approved plan (OpenCode or
    a fresh Claude session). Builds and verifies the code; the ready-to-run prompt for
    the executor lives in `prompts/<slug>.md`.

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
- **Data:** Azure SQL. Typed access with **Kysely**. Types generated with
  `kysely-codegen` into `src/lib/db/types.ts`. SQL lives **only** in `src/lib/db/`
  (infra: client + types) and `src/modules/*/db{.ts,/}` (each module's queries).
- **Repo layout (modules-first):** `src/app/` = thin routing only; `src/modules/<m>/`
  owns each domain (db + components); `src/components/{kit,ui,layout}` = shared UI;
  `src/lib/` = domain-blind infra. Dependency direction: `app → modules → kit/ui/lib`;
  never the reverse. Business-module APIs are namespaced (`/api/maintenance/...`).
  Recipe: `docs/architecture/module-blueprint.md`.
- **Migrations:** **Flyway**, pure versioned SQL in `db/migrations/`
  (`V{n}__{desc}.sql` incremental, `R__{desc}.sql` repeatable). They are **written by the
  DBA sub-agent**; after plan approval the agent applies them to `EBI_dev`
  (`flyway -configFiles=db/flyway.dev.conf migrate` + clean `flyway info` + `pnpm db:gen`
  as evidence). **Production (`EBI`) migrations remain human-run**, only after dev
  validation.

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

**Fast lane — `/ship-module <ask>`** (default for small-to-medium changes):

1. Plan in-session (invokes the `dba` sub-agent when the schema changes) → human
   approves.
2. One continuous pass: persist plan + migrations, apply migrations to `EBI_dev`,
   build (code in `src/`), `docs-sync` reconciles `docs/database/` + `docs/modules/`
   (ERD per schema in `docs/database/erd/`), verify (tests + visual/logic check; gaps
   logged as amendments) → `status: verified`.
3. Human reviews; adjustments continue in-session as amendments.
4. `/commit-plan` → atomic commits → push → PR.

**Full lane** (large plans, destructive migrations, or handoff to another session):

1. `/plan-module <name>` → plan in `docs/plans/<slug>.md` (invokes the `dba`
   sub-agent when the plan touches the schema) → human approves → same session
   persists the plan, creates the migration files in `db/migrations/`, registers them
   in `docs/database/migrations-log.md` and applies them to `EBI_dev`.
2. `/build-plan` → executes the plan, runs `docs-sync`, then verifies (tests +
   visual/logic check against the plan's objective; gaps logged as amendments) →
   `status: verified`.
3. `/commit-plan` → atomic commits → push → PR.

## Verify before calling something done

- `pnpm lint && pnpm build` must pass.
- Schema changes: clean `flyway info` and `docs-sync` executed.
- Report faithfully: if something fails or was skipped, say so with the real output.

## Documentation

- Plans: `docs/plans/` (`_plan-template.md` template). Permanent decisions: ADRs in
  `docs/architecture/adr/`. A plan may produce one or more ADRs.
- Modules: `docs/modules/` (`_module-template.md` template).
- Doc routing: `docs/docs-routing.md` maps module type → which docs to read/skip; the
  doc-access telemetry hook + `/trace-map` audit and refine it.
