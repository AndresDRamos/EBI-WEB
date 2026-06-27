---
description: Plan a new portal module (architecture, ERD, migrations) using plan mode and the specialized sub-agents.
argument-hint: <module-name>
---

Plan the **$1** module for the EBI portal.

Enter plan mode and produce a complete plan, do not write feature code:

1. Read `docs/STATE.md` first (the live-truth digest: active milestone, current decisions,
   DB users, file layout) and `AGENTS.md` (rules). Read the master plan
   `docs/plans/0001-portal-bootstrap.md`, ADRs or module docs **only when you need
   rationale/history** that `STATE.md` does not cover — do not re-read them by reflex.
2. Consult `docs/doc-routing.md`: pick the row matching this module's type and read its
   *Read always* set, pull *Read if* docs only when their condition holds, treat *Skip* as
   known noise, and raise its *Ask up front* questions and *Gotchas* before designing.
3. Use the `architect` sub-agent to define module boundaries, reuse and the per-file
   change plan.
4. If the module touches data, use the `dba` sub-agent to propose the ERD
   (`docs/database/erd.md`) and the Flyway migrations (`db/migrations/`). If it ingests
   from EPS, use the `etl` sub-agent for the source→target mapping.
5. If it embeds Power BI, use the `pbi-embed` sub-agent.
6. Write the plan following `docs/plans/_template.md`. Clarify open questions before
   finalizing.
7. Before persisting, **refine `docs/doc-routing.md`** for this module type: move docs you
   opened but did not use into *Skip*, add any clarification the human had to ask into
   *Ask up front*, and record new traps in *Gotchas*. Refine the existing row; do not
   duplicate it.

When approved, persist the plan with `/save-plan`.
