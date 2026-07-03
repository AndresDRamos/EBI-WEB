# CLAUDE.md

The project instructions live in `AGENTS.md` (single source of truth, shared with OpenCode).
They are imported here so Claude Code uses them:

@AGENTS.md

## Claude Code-specific notes (planner)

- **Plan mode first.** For any module or architecture change, plan before executing. Use
  `/plan-module <name>` and, once the user approves, persist it with `/plan-save`.
- **Specialized sub-agents.** Project-level (`.claude/agents/`): `architect`,
  `data-analyst`, `etl`. User-level (`~/.claude/agents/`): `dba`, `docs-sync`. Invoke them
  per task; do not redo their work by hand.
- **Migrations come from the `dba` sub-agent — never hand-written.** `/plan-module` fires
  `dba` when the plan touches the schema; `/plan-save` materializes the Flyway SQL in
  `db/migrations/`. The planner defines the *what*; `dba` produces the *how* (SQL + ERD
  delta) using the `ebi-sql-dev` MCP (read-only). A human runs `flyway migrate`.
- **The planner writes the execution plan; the executor is not a DBA.** The plan's steps
  plus the ready-to-run prompt in `prompts/<slug>.md` must carry everything the executor
  (OpenCode or a fresh Claude session running `/build-plan`) needs: scope, files to touch,
  acceptance checks. The executor's MCP access is only for extra context if it hits
  complications, not for designing schema or queries.
- **Need precise data shape/values for the executor?** Use the `data-analyst` sub-agent
  (read-only) to extract, profile and explain real data so the execution plan and the
  executor prompt are grounded in the actual database — not assumptions.
- **Claude focuses on plans, ERD, migrations, ADRs and the workflow configuration.**
  Feature code is built via `/build-plan`, then gated by `/verify-plan` before
  `/commit-plan`.
- When a plan is approved, leave it in `docs/plans/<slug>.md` with an updated status; when
  its PR merges, `/commit-plan` prunes it from `main` (the ledger row is the record).
- **Doc-access telemetry is user-level, not in this repo.** The
  `trace-doc-access.mjs` hook lives in `~/.claude/hooks/` and is registered in the user
  `settings.json` (PostToolUse Read|Grep|Glob + Subagent boundaries); it writes
  `.claude/traces/<session>.jsonl` (gitignored) consumed by `/trace-map` to refine
  `docs/docs-routing.md`. Do not re-add the hook to the project settings.
