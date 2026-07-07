---
id: org-schema-plant-process
status: committed
created: 2026-07-07
touches: [docs/modules/maintenance.md, docs/modules/navigation.md, docs/modules/rbac.md]
migrations: [V15]
supersedes: null
superseded_by: null
---

# Org schema: plant + unified process catalog + plant↔process assignment

## Objective

Extract the **organizational** entities out of the identity-focused `auth`
schema and unify the **process catalog** out of `maint`, into a new `org`
schema:

- `auth.plant` → `org.plant` (canonical plant catalog).
- `maint.process` → `org.process` (canonical **company-wide** process catalog —
  a single "Corte láser" now feeds equipment, plants and the future process
  route, instead of a maintenance-only list).
- New `org.plant_process` (N:M): *which processes each plant runs*. A single
  `process_id` repeats freely across plants (same logic as Departamento–Rol,
  minus the global child uniqueness). Foundation for the process route ("in
  which plant is each material processed").

Process **administration moves to the admin panel** (Organización group),
alongside plants/departments/roles — the maintenance module keeps only the
asset↔process linking. `auth.user_plant`, `auth.department` and `auth.role`
stay in `auth` (identity / RBAC coupling).

## Steps

1. **Migration `V15__org_schema_plant_process.sql`** (dba proposal — see
   Database impact). `CREATE SCHEMA org` + two `ALTER SCHEMA org TRANSFER`
   (`auth.plant`, `maint.process`) + `org.plant_process` (link-row + reverse
   index) + permission seed (`org.process:{create,update,delete}`,
   `org.plant_process:assign`) + retire `maintenance.process:*` + guarded
   `DELETE` of the V9-seeded `maintenance` **Procesos** `nav_item`
   (`href = /maintenance/process`) + `org` schema grants. Apply to `EBI_dev`
   (`flyway migrate`, clean `flyway info`), then `pnpm db:gen`.

2. **`src/modules/org/db/`** — add an `org`-schema binding for the moved/new
   tables (role/department stay on the `auth` binding in `org.ts`):
   - `plants.ts` — move plant CRUD here bound to `withSchema("org")` (was in
     `org.ts` bound to `auth`); keep the exported function names
     (`listPlants`, `createPlant`, `updatePlant`, `deletePlant`) so import
     sites don't churn — re-export from `org.ts` **or** update the ~5 import
     sites (`admin/organization/plants/page.tsx`,
     `maintenance/machines/[code]/page.tsx`, `maintenance/machines/page.tsx`,
     `api/plants/**`). Prefer re-export to minimize churn.
   - `processes.ts` — process **catalog CRUD** bound to `org`
     (`listProcesses`, `findProcessById`, `createProcess`, `updateProcess`,
     `softDeleteProcess`, `deleteProcess`).
   - `plant-process.ts` — assignment reads/writes bound to `org`:
     `listPlantProcesses()` (all links, for the grouped view),
     `setPlantProcesses(plantId, processIds[])` (replace-set in one trx, same
     shape as `setAssetProcesses`), plus a reverse `listPlantsByProcess` if
     handy. MSSQL insert pattern `.output("inserted.<pk>")`; the trx inherits
     the `org` binding.

3. **`src/modules/maintenance/db.ts`** — process now lives in `org`:
   - Add `const orgDb = rootDb.withSchema("org")` (same pattern as the existing
     `authDb` for plant names).
   - **Keep** `listProcesses` / `findProcessById` as thin `org`-bound reads
     (the machine detail picker + QR flows import them — keep names stable).
   - **Remove** `createProcess` / `updateProcess` / `softDeleteProcess` /
     `deleteProcess` (moved to `modules/org/db/processes.ts`).
   - **Keep** `setAssetProcesses` (`asset_process` stays in `maint`; its FK
     now crosses to `org.process`).
   - Refactor the process joins in `listAssets` / `getAssetDetail`: the
     `asset_process → process` join must resolve process names via an
     `org`-bound query merged in JS (same technique as `plantNamesById`),
     because a `maint`-bound client can no longer see `process`.

4. **API** —
   - New `src/app/api/org/processes/route.ts` + `[id]/route.ts`: move the
     maintenance process CRUD handlers, re-point imports to
     `modules/org/db/processes`, swap permission codes to `org.process:*`.
   - New `src/app/api/org/plant-process/route.ts` (and/or
     `[plantId]/route.ts`): `setPlantProcesses`, gated
     `requirePermission("org.plant_process:assign")`.
   - Delete `src/app/api/maintenance/processes/**`.
   - `/api/plants/**` unchanged (its db now reads `org.plant`).

5. **Admin panel (Organización group)** — add two tabs in
   `admin/organization/layout.tsx` (`PageTabs`): **Procesos** and
   **Procesos por planta**.
   - `src/app/(portal)/admin/organization/processes/page.tsx` — loads
     `listProcesses` (org) → `ProcessesTablePage` **moved** to
     `modules/org/components/processes-table-page.tsx`, API re-pointed to
     `/api/org/processes`, permission codes `org.process:*`.
   - `src/app/(portal)/admin/organization/plant-processes/page.tsx` — new
     `PlantProcessesPage` (`modules/org/components/`): `GroupedDataTable`,
     plants as groups, assigned processes as child rows; **add-child = pick
     from the existing catalog** (multi-select), not create; remove-child =
     unassign. Gated `org.plant_process:assign` via `useCan`.

6. **Maintenance cleanup** — delete the portal **Procesos** page
   (`src/app/(portal)/maintenance/process/`) and the maintenance
   `processes-table-page.tsx` (its content moved to `org`). Re-point the
   machine-detail "Créalos en Procesos" link from `/maintenance/process` to
   `/admin/organization/processes`. The V13 `DELETE` removes its `nav_item`.
   **Nav-cache gotcha (routing doc):** the migration `DELETE` does *not*
   invalidate the persisted `"nav"` `unstable_cache`; fire `revalidateTag("nav")`
   via any `/api/nav/*` mutation (or restart dev) after migrating, or the
   guard/sidebar keeps the stale item.

7. **Docs (`docs-sync`)** — new `docs/database/erd/org.md` +
   `dictionary/org.md`; deltas to `auth.md` (remove `plant` block; note
   `user_plant.plant_id` is now cross-schema), `maint.md` (remove `process`
   block; update cross-schema FK prose to `org.plant` / `org.process`),
   `production.md` (cross-schema FK prose → `org.plant`); `erd/_index.md`,
   `dictionary/_index.md`, `migrations-log.md` (V13 row), `docs/modules/*`,
   `docs/docs-routing.md`, `docs/STATE.md`.

8. **Verify** — `pnpm lint && pnpm build`; clean `flyway info`; authenticated
   E2E on `/api/org/processes` and `/api/org/plant-process`; admin panel shows
   Procesos + Procesos por planta; machine detail still lists/saves processes.

## Database impact

`dba` sub-agent proposal (approved with its 4 recommended defaults). Single
migration **V15** (`auth`/`maint` survive, only lose one table each — no
`DROP SCHEMA`).

- `CREATE SCHEMA org`; `ALTER SCHEMA org TRANSFER OBJECT::auth.plant`;
  `ALTER SCHEMA org TRANSFER OBJECT::maint.process` (guarded on source object).
  Metadata-only: rows, FKs (bound by `object_id` — survive intact, no
  recreation), CHECKs, defaults, all indexes and stats move; constraint/index
  names carry no schema prefix so none change.
- `org.plant_process (plant_id, process_id)` PK, two `NO ACTION` FKs to
  `org.plant` / `org.process`, plus `IX_plant_process_process` for the reverse
  route "which plants run process X". **Link-row only** (no `is_active` /
  timestamps / `sort_order`) — mirrors `maint.asset_process`; `sort_order` is a
  trivial reversible `ALTER ADD` later if the route UI needs ordering.
- Permissions: seed `org.process:create|update|delete` (mirror `org.plant:*`)
  + `org.plant_process:assign` (coarse, covers assign/unassign); **retire**
  `maintenance.process:create|update|delete` (cascade-deletes their
  `role_permission` grants).
- Retire the `maintenance` **Procesos** `nav_item` (V9-seeded,
  `href = /maintenance/process`) via guarded idempotent `DELETE`.
- Grants: `org` schema — `ebi_app` CRUD, `ebi_agent_ro` SELECT (schema-scoped
  grants do not follow transfers). `ebi_migrator` owns the schema (no explicit
  DDL grant, per every prior schema migration).

**Cross-schema FKs that re-point automatically (audited, none recreated):**
`auth.user_plant.plant_id`, `maint.asset.plant_id`,
`production.production_line.plant_id`, `production.cell.plant_id` → `org.plant`;
`maint.asset_process.process_id` → `org.process`.
`production.asset_cell_assignment` does **not** reference plant.

**Irreversible / coordinated (plain language):**
- The two `ALTER SCHEMA TRANSFER` have no `undo`; rollback needs an inverse
  migration. **Every query / Kysely type referencing `auth.plant` or
  `maint.process` by qualified name breaks the instant the transfer runs** — a
  coordinated code+DB cutover in one release (as V12 was for `production`).
  Trivial in `EBI_dev` (same pass).
- The `DELETE` of `maintenance.process:*` permissions **cascade-deletes any
  `role_permission` grants** referencing them — unrecoverable by rolling back.
  No-op in `EBI_dev` (RBAC ships empty; admin bypasses at the app layer). **In
  production `EBI` a human must confirm no profile holds them first.**

## Amendments

<!-- Appended during the verification phase. -->

- 2026-07-07 — **Migration renumbered V13 → V15.** `origin/main` advanced during
  planning: the `plant-layout-foundation` plan merged, claiming V13 and V14
  (both already applied to shared `EBI_dev`). Re-verified per the skill's
  "renumber if taken" rule; the migration is otherwise unchanged. The plan
  branch was cut from the updated `origin/main` (tip `54f660c`), so it includes
  that work.
- 2026-07-07 — **`Procesos por planta` built as a focused checkbox component,
  not `GroupedDataTable`.** The kit's grouped table models owned child rows with
  per-child soft/hard-delete + `is_active`; a plant↔process *assignment* is a
  link-row with no lifecycle, and "add" means picking from the catalog, not
  creating. A bespoke `plant-processes-page.tsx` (plant cards + a multi-select
  dialog, mirroring the machine-detail Procesos tab) fits the semantics
  honestly; the plan's "GroupedDataTable" note is superseded by this choice.
- 2026-07-07 — **Verified.** Evidence: `flyway migrate` → Schema version 15,
  Success; `flyway info` clean; `pnpm db:gen` regenerated 36 tables; `pnpm lint`
  clean; `pnpm build` compiled (new routes `/admin/organization/{processes,
  plant-processes}`, `/api/org/{processes,plant-process}` present). Authenticated
  E2E (tester/admin) on the running dev server: `GET /api/org/processes` → 200
  `{processes:[]}`, `GET /api/plants` → 200 (plant now in `org`),
  `PUT /api/org/plant-process/1 {process_ids:[]}` → 200 `{ok:true}`,
  `GET /api/maintenance/assets` → 200 (refactored cross-schema plant+process
  join), SSR `/maintenance/machines` and `/admin/organization/plant-processes`
  → 200. Unauthenticated smoke: the three `org` routes → 401 (gate wired). Note:
  the process catalog is empty in `EBI_dev` (no test rows), so `org.process`
  returned `[]` — the query path is exercised, data is simply absent.
