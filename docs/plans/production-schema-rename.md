---
id: production-schema-rename
status: committed
created: 2026-07-06
touches: [docs/modules/production.md]
migrations: [V12]
supersedes: null
superseded_by: null
---

# Rename schema `produccion` → `production`

## Objective

Correct the one Spanish-named database schema to the project's English DB naming
convention: `produccion` (created by V11) becomes `production`. The code module is
already named `production` and the V11 nav/permission seeds are already English
(`production`, `production.*`), so this closes the only gap. Done now while the
schema holds test data only and is referenced by a single code module — the cost
of the rename only grows from here.

## Steps

1. Migration `V12__rename_produccion_schema_to_production.sql` (dba proposal):
   `CREATE SCHEMA production` + guarded `ALTER SCHEMA production TRANSFER` per
   table (`production_line`, `cell`, `asset_cell_assignment`) + re-issued
   schema-level GRANTs (`ebi_app` CRUD, `ebi_agent_ro` SELECT) + `DROP SCHEMA
   produccion`. Apply to `EBI_dev` (`flyway migrate`, clean `flyway info`), then
   `pnpm db:gen`.
2. Code: `src/modules/production/db.ts` — `withSchema("produccion")` →
   `withSchema("production")` and the schema-name comments; update the schema
   mention in `src/modules/production/enums.ts`'s header comment.
3. `docs-sync`: rename `docs/database/erd/produccion.md` →
   `erd/production.md` and `docs/database/dictionary/produccion.md` →
   `dictionary/production.md`; update `erd/_index.md`, `dictionary/_index.md`,
   the cross-mention in `erd/maint.md` / `dictionary/maint.md`,
   `docs/modules/production.md`, `docs/docs-routing.md` and `docs/STATE.md`
   where they cite the schema; migrations-log row for V12.
4. Verify: `pnpm lint && pnpm build`.

## Database impact

- **V12** — metadata-only rename: `ALTER SCHEMA ... TRANSFER` moves the 3 tables
  with data, FKs (bound by object_id — transfer order irrelevant), CHECKs,
  defaults, all 7 indexes (including the filtered unique ones) and statistics
  intact. Constraint/index names carry no schema prefix, so none change.
- Schema-scoped grants do **not** follow transferred objects: the V11 grants on
  `SCHEMA::produccion` die with the old schema and are re-issued on
  `production` (guarded, idempotent).
- **Irreversible in practice:** `DROP SCHEMA produccion` has no clean undo
  (reverting would need an inverse V13). No data loss — DROP SCHEMA fails loudly
  (msg 3729) if anything unexpected still lives in the schema.
- **Deploy coupling:** from the TRANSFER onward, queries against `produccion.*`
  fail until the code ships `withSchema("production")`. Trivial in `EBI_dev`
  (same pass); in production `EBI` the human-run migration and the code deploy
  must share one release window.
- ERD delta: `erd/produccion.md` → `erd/production.md` (title + grant note only;
  the mermaid diagram is unchanged).

## Amendments

- 2026-07-06 — No scope deviations; executed as planned. Verification evidence:
  clean `flyway info` (Schema version 12, Success), `pnpm db:gen` (32 tables),
  live introspection via `ebi-sql-dev` (old schema gone, 3 tables + test data
  in `production`, 5 schema grants re-issued), `pnpm lint` + `pnpm build`
  clean, and authenticated E2E hit on `/api/production/{lines,cells}` → 200
  with data. Incidental env repairs (not plan changes): pruned the stale
  `gallant-maxwell` worktree and reset a corrupt `.next` cache; the dev server
  on 3001 was restarted as a consequence.
