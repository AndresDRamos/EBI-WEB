# CLAUDE.md

The project instructions live in `AGENTS.md` (single source of truth, shared with OpenCode).
They are imported here so Claude Code uses them:

@AGENTS.md

## Claude Code-specific notes (planner)

- **Plan mode first.** For any module or architecture change, plan before executing. Use
  `/plan-module <name>` and save the result in `docs/plans/` with `/save-plan`.
- **Specialized sub-agents** (in `.claude/agents/`): `architect`, `dba`, `data-analyst`,
  `etl`, `pbi-embed`, `docs-sync`. Invoke them per task; do not redo their work by hand.
- **Claude triggers the migrations — OpenCode never writes them.** Once **the user approves
  the plan**, Claude (the planner) fires the `dba` sub-agent to produce the Flyway SQL in
  `db/migrations/` and to update the ERD. The planner defines the *what*; `dba` produces the
  *how* (SQL + ERD) using the `ebi-sql-dev` MCP (read-only). Do not write migrations by hand.
- **Claude builds the execution plan for OpenCode (OpenCode is not a DBA).** After the
  migrations exist, Claude writes the step-by-step execution plan that OpenCode will follow
  to implement the feature code in `src/`. OpenCode's MCP access is **only for extra context
  if it hits complications while executing**, not for designing the schema or queries.
- **Hand OpenCode a ready-to-run prompt.** Alongside the execution plan, Claude provides the
  exact prompt OpenCode needs to execute that plan with maximum precision (scope, files to
  touch, acceptance checks, and the `commit-plan` step).
- **Need precise data shape/values for the executor?** Use the `data-analyst` sub-agent
  (read-only) to extract, profile and explain real data so the execution plan and the
  OpenCode prompt are grounded in the actual database — not assumptions.
- **Feature code is built by OpenCode.** Claude focuses on plans, ERD, migrations, ADRs and
  the workflow configuration.
- When a plan is approved, leave it in `docs/plans/NNNN-*.md` with an updated status.
