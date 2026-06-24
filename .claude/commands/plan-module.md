---
description: Plan a new portal module (architecture, ERD, migrations) using plan mode and the specialized sub-agents.
argument-hint: <module-name>
---

Plan the **$1** module for the EBI portal.

Enter plan mode and produce a complete plan, do not write feature code:

1. Read `AGENTS.md`, the master plan `docs/plans/0001-portal-bootstrap.md` and any
   relevant ADRs and module docs.
2. Use the `architect` sub-agent to define module boundaries, reuse and the per-file
   change plan.
3. If the module touches data, use the `dba` sub-agent to propose the ERD
   (`docs/database/erd.md`) and the Flyway migrations (`db/migrations/`). If it ingests
   from EPS, use the `etl` sub-agent for the source→target mapping.
4. If it embeds Power BI, use the `pbi-embed` sub-agent.
5. Write the plan following `docs/plans/_template.md`. Clarify open questions before
   finalizing.

When approved, persist the plan with `/save-plan`.
