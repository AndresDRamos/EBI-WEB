---
id: NNNN-plan-name
status: draft            # draft -> approved -> built -> verified -> committed -> superseded
created: YYYY-MM-DD
touches: []               # docs/modules/* this plan reads or intends to change
migrations: []            # versions from db/migrations/, if any
supersedes: null           # id of a prior plan this replaces, if any
superseded_by: null        # filled in later if this plan is replaced before being committed
---

# <Plan title>

## Objective

<!-- What this plan achieves and why, in terms someone outside the task
could understand without reading the prompt file that spawned it. -->

## Steps

<!-- Specific, ordered, sized so /build-plan can execute without re-deriving
intent. If a step depends on a sub-agent decision (e.g. the DBA agent's
migration proposal), reference it, don't restate it. -->

1.
2.
3.

## Database impact

<!-- "None" is a valid answer. If not none: migrations proposed, indexes,
irreversible operations, and the ERD delta. Filled in by the `dba` sub-agent
during /plan-module if the plan touches the schema. -->

## Amendments

<!-- Appended during /verify-plan, never edited into the sections above.
Each entry: what changed vs. the original plan, why, and whether it means
the plan's Objective is still accurate or the plan should be marked
superseded by a follow-up plan instead. -->

- YYYY-MM-DD —
