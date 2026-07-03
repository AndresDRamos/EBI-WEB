# CLAUDE.md

The project instructions live in `AGENTS.md` (single source of truth, shared with OpenCode).
They are imported here so Claude Code uses them:

@AGENTS.md

## Claude Code-specific notes (planner)

- **Plan mode first.** For any module or architecture change, plan before executing.
  Default to `/ship-module <ask>` (plan → approval → build+verify in one pass); use
  `/plan-module <name>` for large plans, destructive migrations, or handoff to another
  session (on approval it persists the plan and applies dev migrations itself).
- **Specialized sub-agents.** Project-level (`.claude/agents/`): `architect`,
  `data-analyst`, `etl`. User-level (`~/.claude/agents/`): `dba`, `docs-sync`. Invoke them
  per task; do not redo their work by hand.
- **Migrations come from the `dba` sub-agent — never hand-written.** `/ship-module` and
  `/plan-module` fire `dba` when the plan touches the schema and, after approval,
  materialize the Flyway SQL in `db/migrations/` and apply it to `EBI_dev` (clean
  `flyway info` + `pnpm db:gen` as evidence). The planner defines the *what*; `dba`
  produces the *how* (SQL + ERD delta) using the `ebi-sql-dev` MCP (read-only). A human
  runs production migrations.
- **The planner writes the execution plan; the executor is not a DBA** (full lane). The
  plan's steps plus the ready-to-run prompt in `prompts/<slug>.md` must carry everything
  the executor (OpenCode or a fresh Claude session running `/build-plan`) needs: scope,
  files to touch, acceptance checks. The executor's MCP access is only for extra context
  if it hits complications, not for designing schema or queries.
- **Need precise data shape/values for the executor?** Use the `data-analyst` sub-agent
  (read-only) to extract, profile and explain real data so the execution plan and the
  executor prompt are grounded in the actual database — not assumptions.
- **Claude focuses on plans, ERD, migrations, ADRs and the workflow configuration.**
  Feature code is built via `/ship-module` (fast lane) or `/build-plan` (full lane);
  both end with the verification phase that gates `/commit-plan`
  (`status: verified`).
- When a plan is approved, leave it in `docs/plans/<slug>.md` with an updated status; when
  its PR merges, `/commit-plan` prunes it from `main` (the ledger row is the record).
- **Doc-access telemetry is user-level, not in this repo.** The
  `trace-doc-access.mjs` hook lives in `~/.claude/hooks/` and is registered in the user
  `settings.json` (PostToolUse Read|Grep|Glob + Subagent boundaries); it writes
  `.claude/traces/<session>.jsonl` (gitignored) consumed by `/trace-map` to refine
  `docs/docs-routing.md`. Do not re-add the hook to the project settings.
