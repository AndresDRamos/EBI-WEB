# CLAUDE.md

The project instructions live in `AGENTS.md` (single source of truth, shared with OpenCode).
They are imported here so Claude Code uses them:

@AGENTS.md

## Claude Code-specific notes (planner)

- **Plan mode first.** For any module or architecture change, plan before executing. Use
  `/plan-module <name>` and save the result in `docs/plans/` with `/save-plan`.
- **Specialized sub-agents** (in `.claude/agents/`): `architect`, `dba`, `etl`,
  `pbi-embed`, `docs-sync`. Invoke them per task; do not redo their work by hand.
- **The DBA writes the migrations**, not the planner by hand. The planner defines the what;
  `dba` produces the SQL and the ERD using the `ebi-sql-dev` MCP (read-only).
- **Feature code is built by OpenCode.** Claude focuses on plans, ERD, migrations, ADRs and
  the workflow configuration.
- When a plan is approved, leave it in `docs/plans/NNNN-*.md` with an updated status.
