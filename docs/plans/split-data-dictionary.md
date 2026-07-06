---
id: split-data-dictionary
status: verified
created: 2026-07-05
touches: [docs/database/dictionary, docs/docs-routing.md, docs/STATE.md, db/README.md]
migrations: []
supersedes: null
superseded_by: null
---

# Split the data dictionary into per-schema pages

## Objective

Replace the monolithic `docs/database/data-dictionary.md` (~608 lines and growing
with every module) with per-schema pages under `docs/database/dictionary/`,
mirroring the ERD layout already in use (`erd/_index.md` + `erd/<schema>.md`).
Grounds: the 2026-07-04 `/trace-map` audit (9 sessions) measured the dictionary
being read whole every time — by the planner during planning and by `docs-sync`
on every sync — while readers only ever need one schema. Goal is to stop wasting
tokens, not to "save" them: index → target schema page becomes the only route,
and `docs-sync` rewrites only the touched schema file.

## Steps

1. Create `docs/database/dictionary/_index.md`: the monolith's maintained header
   (docs-sync notice, last-synced, V-range) + one line per table (name → purpose)
   linking to its schema page.
2. Create `docs/database/dictionary/{dbo,etl,auth,maint,produccion}.md` with the
   monolith's content moved verbatim (no substantive rewrites); each page carries
   its own "generated — do not edit" header and keeps its schema-scoped grants
   and seeds notes (V11 `produccion` seeds stay in `produccion.md`).
3. Delete `docs/database/data-dictionary.md`.
4. Update in-repo references:
   - `docs/docs-routing.md` rows ETL (line 18) and Admin CRUD (line 39) →
     "`dictionary/_index.md`, then only the target schema page"; Change log
     entry marking proposal #1 (2026-07-04) as applied.
   - `docs/STATE.md` "Where the history lives" pointer → `dictionary/_index.md`.
   - `db/README.md` living-docs section → name the `dictionary/` folder as
     generated.
   - `.claude/agents/data-analyst.md` → index + target schema page.
5. Update the user-level `docs-sync` agent instructions
   (`~/.claude/agents/docs-sync.md`): refresh only the touched schema's
   `dictionary/<schema>.md`, plus `_index.md` when the table inventory changes.
   Out-of-repo change — does not travel in the PR (same as the telemetry hook).
6. Run the `docs-sync` sub-agent to validate coherence; verify with
   `pnpm lint && pnpm build` and a clean grep for `data-dictionary` across
   repo docs/agents.

## Database impact

None. Docs-only; no migrations, no schema access.

## Amendments

<!-- Appended during the verification phase, never edited into the sections above. -->

- 2026-07-05 — Branch name is `docs/trace-map-database` (user-chosen), not
  `docs/split-data-dictionary`. No content gaps: docs-sync's diff of the
  monolith vs. the five schema pages found only the `## Schema X` → page-title
  header change; `pnpm lint && pnpm build` passed (exit 0). Objective holds.
- 2026-07-05 — Rolled the remaining `/trace-map` proposals (#2–#5) into this
  same plan/branch per user request: added `docs-routing.md` cross-type notes
  for the `docs/database/` entry-point rule and the already-injected-files
  rule, a "Cross-phase (plan/commit ceremony)" section, and a "Sub-agent
  routes (measured)" section; updated the user-level `dba` agent to read
  `dictionary/<schema>.md` only on demand. Docs-only, no re-verification
  needed beyond the lint/build already run (no code touched). Objective
  still holds.
