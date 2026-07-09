# DOC-ROUTING — learned documentation map (EBI-Web)

> **Self-maintained routing table.** Maps *module type* → which docs to read, which to skip,
> and what to ask up front. The goal: stop reading docs by reflex and front-load the
> questions/gotchas that historically caused rework. Consulted and refined by `/plan-module`.
>
> **How to use (planning):** find the row for the module at hand, read its *Read always* set
> first, pull *Read if* only when its condition holds, and treat *Skip* as known noise.
> **How to refine (closing a plan):** edit the matching row — move docs that were opened but
> unused into *Skip*; add any clarification the human had to ask into *Ask up front*; record
> new traps in *Gotchas*. Refine existing rows; do not append duplicates. Keep each row tight.
>
> Always-loaded baseline for every type: `docs/STATE.md` + `AGENTS.md`. Rows list extras.

## Routing by module type

### ETL / ingestion from EPS
- **Read always:** `docs/database/erd/_index.md` and `docs/database/dictionary/_index.md` (then only the target schema pages, e.g. `erd/etl.md` + `dictionary/etl.md` — never the whole folder)
- **Read if:** `docs/database/migrations-log.md` (only if it touches schema) · ADR (only for rationale) · `docs/modules/etl-eps-ebi.md` *once it exists* (retired in the doc restructure; recreate when the ETL module is planned)
- **Skip (known noise):** ADR 0001 (auth)
- **Ask up front:** watermark column for incremental load? exact EPS source tables? `staging`→`core` ownership?
- **Gotchas:** EPS is read-only — never write to it. Verify docs↔live-schema drift via `ebi-sql-dev` MCP before designing.

### Auth / security
- **Read always:** `docs/architecture/adr/0001-portal-owned-auth.md`
- **Skip (known noise):** anything pre-dating ADR 0001 that mentions MSAL (plan 0001 was pruned for exactly this staleness).
- **Ask up front:** session strategy already fixed? new roles/permissions needed?
- **Gotchas:** live truth = portal-owned credentials (Auth.js v5), **not** MSAL. Secrets only in `.env`/Key Vault.

### Power BI embedding / dashboards
- **Read always:** `src/lib/powerbi/` directly (no module doc today — `docs/modules/powerbi-admin.md` was retired in the doc restructure)
- **Read if:** ADR 0001 (for the deferral rationale)
- **Skip (known noise):** ETL/DB docs unless the module also persists data.
- **Ask up front:** is embedding being reintroduced or still placeholder for this milestone?
- **Gotchas:** embedding is **deferred in v1**. Keep `src/lib/powerbi/` mode-agnostic (`Aad` dev / `Embed` prod); fork token acquisition, not the embed component.

### Admin CRUD (users, catalogs, report metadata)
- **Read always:** `docs/database/erd/auth.md` (identity/RBAC catalogs) · `docs/database/erd/org.md` (organizational catalogs: plants, processes, plant↔process — moved out of `auth`/`maint` in V15) (plus `erd/dbo.md` for reports) · the existing module slice `src/modules/<module>/db*.ts` + `src/app/api/**` for the entity (M2 already built users/plants/departments/reports CRUD — extend, don't rebuild)
- **Read if:** `docs/database/dictionary/auth.md` (when adding/altering columns; index at `dictionary/_index.md`) · relevant `docs/modules/*.md` (only if one exists for the entity)
- **Skip (known noise):** ETL docs · ADR 0001 unless touching auth/roles · the dormant Reportes admin screens (don't refactor them for unrelated work).
- **Ask up front:** which least-privilege DB user runs this (`ebi_app`)? soft vs hard delete (and what does the inactive-view "permanent delete" do for referenced rows)? are any roles code-coupled — which are protected (only `admin`; `viewer` is normal CRUD)?
- **Gotchas:** all DB access through Kysely in `src/lib/db/` (infra) + `src/modules/*/db*.ts` — no raw queries elsewhere · the session JWT carries only `userId/username/display_name/roles/token_version` (NO email) — read profile fields server-side via `getUserDetail`, not from the session · catalog DELETEs 409 on FK by design (block referenced rows); user deletes cascade via the junction FKs.

### RBAC / permission-gated actions
- **Read always:** `docs/modules/rbac.md` · `docs/architecture/adr/0004-role-as-access-profile.md`
- **Read if:** `docs/database/erd/auth.md` (only if touching `permission` / `role_permission` / `role.department_id`) · the owning module's doc (when seeding new permission codes)
- **Skip (known noise):** ETL docs · ADR 0001 (identity model is orthogonal; only the JWT `roles` claim is shared)
- **Ask up front:** does the new endpoint need a new permission code (→ seed it in the same plan's migration)? mutation or read (v1 gates mutations only)?
- **Gotchas:** `admin` bypasses at app layer — never create grant rows for it · permission codes are contract: `requirePermission("x.y:z")` without a seeded row can never pass for non-admins · `useCan` is display-only and may be stale; the API is the barrier.

### Layout / navigation
- **Read always:** `docs/modules/navigation.md`
- **Read if:** `docs/database/erd/auth.md` (only if touching the `nav_*` tables) · the relevant module's doc if seeding a new section · `docs/architecture/adr/0005-section-grants-authorize-pages.md` (when the change touches page reachability / the segment guard)
- **Skip (known noise):** ETL docs · ADR 0001 unless touching auth
- **Ask up front:** does the new section belong under `auth` role-priority visibility, or does it need public/no-role default?
- **Gotchas:** sections **and their items** are seeded by the migration of the module that owns the route — never let the admin panel create a section from scratch. The `admin` role needs no grant rows (sees everything, including inactive sections — rendered dimmed). Section grants now **authorize pages** (ADR 0005): each module must add `(portal)/<module>/layout.tsx` calling `requireSectionOrRedirect("<code>")`, or its pages stay reachable by any authenticated user. The admin panel rail is code-built (`ADMIN_NAV_SECTION`), not a `nav_section`.

### Maintenance (CMMS)
- **Read always:** `docs/modules/maintenance.md` · `docs/database/erd/maint.md`
- **Read if:** `docs/database/erd/org.md` (asset location/plant derivation, V18) · `docs/modules/production.md` (cell/asset assignment invariant) · `docs/architecture/adr/0002-azure-blob-asset-documents.md` (document storage)
- **Skip (known noise):** ETL docs · ADR 0001
- **Ask up front:** does the change touch the category/type catalog (matrícula prefix, process link) or just the asset record itself?
- **Gotchas:** never insert `maint.asset.code` by hand — only `createAsset` claims the `asset_code_sequence` counter under `UPDLOCK + SERIALIZABLE`. Moving an asset's location must close its current cell assignments (see the module doc's "Do not touch" section).

### Business module with temporal-bridge catalogs (production-style)
- **Read always:** `docs/modules/production.md` · `docs/database/erd/production.md` · `docs/architecture/module-blueprint.md`
- **Read if:** `docs/modules/maintenance.md` + `docs/database/erd/maint.md` (when touching `asset_category` / the Ubicación tab) · `docs/modules/rbac.md` / `docs/modules/navigation.md` (when seeding new permission codes or nav rows) · `docs/architecture/cad-layout-contract.md` + ADR 0006 (only when touching layout import / DXF / placements)
- **Skip (known noise):** ETL docs · ADR 0001
- **Ask up front:** does the new relation need temporal validity (close+open, history preserved) or a plain M:N? does the section dark-launch (`is_active = 0`)?
- **Gotchas:** never UPDATE `asset_id`/`cell_id` in place on `asset_cell_assignment` — close + insert; the filtered unique index only blocks a duplicate *current* pair · migration-seeded nav rows do **not** invalidate the persisted `"nav"` `unstable_cache` — fire `revalidateTag` via any `/api/nav/*` mutation after migrating, or the section guard redirects even admins · shared enum domains live in one module and are re-exported (`asset_category` canonical in `src/modules/production/enums.ts`; maintenance re-exports) — keep `enums.ts` pure.

### Pure UI / no data
- **Read always:** relevant `docs/modules/*.md`
- **Skip (known noise):** all `docs/database/*` · ADR 0001 · ETL docs.
- **Ask up front:** does it reuse existing shadcn/ui components? EZI brand tokens applied?
- **Gotchas:** EZI identity — charcoal `#373a36`, orange `#ff5c35`, Montserrat, minimalist industrial.

## Cross-type notes

- `STATE.md` covers most "current truth". Pruned plans (see the ledger in
  `docs/plans/README.md`) live only in git history — never treat them as live docs.
- When a row's *Skip* or *Gotchas* keeps proving wrong, fix it here in the same session — this
  table is only worth its tokens if it stays honest.
- **`docs/database/` entry point is always the index.** For both `erd/` and `dictionary/`,
  read `_index.md` first, then only the target schema page it points to (e.g. `erd/etl.md` +
  `dictionary/etl.md`). Never Glob or read the whole folder — a row's "Read always" already
  names the specific page needed.
- **Already-injected files: never re-Read them.** `AGENTS.md`, `CLAUDE.md` and
  `docs/STATE.md` are always in context at session start (STATE is the always-loaded
  baseline). Do not call Read on them by reflex. Re-read `STATE.md` only immediately after
  editing it, to confirm the write landed — not to "check current truth" again mid-session.

### Cross-phase (plan/commit ceremony)

Not module-specific — belongs to the skill phase, not a routing row per module type:

- `docs/plans/_plan-template.md` — read once, when drafting a plan's structure
  (`/plan-module`/`/ship-module` planning phase). Skip if the skill you're running already
  embeds the template's shape in its own instructions.
- `.github/pull_request_template.md` — read once, only in the `/commit-plan` phase. Never
  needed during planning or building.

### Sub-agent routes (measured, `/trace-map` 2026-07-04)

- `dba` — lean route: target schema's `erd/<schema>.md` + relevant ADRs + `module-blueprint.md`.
  Reads **zero** dictionary pages unless a proposed column needs an existing description;
  when it does, read only `dictionary/<schema>.md` (never `_index.md` alone, never the whole
  folder). Use this as the expected baseline for future trace audits.
- `docs-sync` — rewrites only the touched schema's `dictionary/<schema>.md` /
  `erd/<schema>.md`; touches `_index.md` only when the table inventory or sync header changes.
- `data-analyst` — `erd/_index.md` + `dictionary/_index.md`, then only the target schema pages,
  before querying live data.

## Change log

> Append-only. `/trace-map` logs proposed routing corrections here (measured route vs. the
> table above); a human or a later planning session folds accepted proposals into the rows.

- 2026-07-02 — manual repair: pointed rows at the per-schema ERD (`docs/database/erd/*.md`)
  and removed references to files retired by the doc restructure (`docs/database/erd.md`,
  `docs/modules/etl-eps-ebi.md`, `docs/modules/powerbi-admin.md`,
  `docs/architecture/overview.md`).
- 2026-07-03 — docs-sync (plan production-cell-assignment): added row "Business module with
  temporal-bridge catalogs"; recorded the nav-cache and shared-enums gotchas.
- 2026-07-04 — /trace-map (9 sessions, 2026-06-28→07-04, 520 events). Measured findings and
  proposals (goal: stop wasting tokens, not "save" them):
  1. **`data-dictionary.md` is read monolithically but rarely by whom expected.** 3 full
     reads measured: 1× by `main` during planning, 2× by `docs-sync` (its maintainer —
     legitimate). The `dba` sub-agent read **zero** dictionary in these traces; it worked
     from `erd/<schema>.md` + ADRs + `module-blueprint.md`, which is the efficient route.
     Proposal: split the dictionary per schema, mirroring the ERD layout already adopted —
     `docs/database/dictionary/_index.md` (one line per table: name + purpose) +
     `dictionary/<schema>.md` (auth ≈230 lines, maint ≈260, produccion ≈90, etl ≈30,
     dbo ≈8). Update rows that cite `data-dictionary.md` to "read `_index.md`, then only
     the target schema page"; `docs-sync` keeps rewriting only the touched schema file.
  2. **ERD full-sweep by `main`.** One session read all four `erd/*.md` pages up front
     instead of `_index.md` → target schema. Reinforce in rows: the entry point is
     `erd/_index.md`, never a glob of the folder.
  3. **Re-reads of auto-loaded files.** `AGENTS.md`/`CLAUDE.md` were explicitly Read in 3
     sessions despite being injected every session; `docs/STATE.md` was read up to 4× in a
     single session. Candidate cross-type note: "AGENTS/CLAUDE are already in context —
     never Read them; re-read STATE.md only after an edit to it."
  4. **Unrouted but recurring:** `.github/pull_request_template.md` (4 sessions, commit
     phase) and `docs/plans/_plan-template.md` (4 sessions, planning phase) are consistently
     needed but appear in no row — they belong to the skills' own flow; consider a
     "Cross-phase (plan/commit ceremony)" note instead of per-module rows.
  5. **No routing row exists for sub-agents** (`dba`, `docs-sync`, `data-analyst`); their
     measured routes are lean today, but once the dictionary splits, `dba`'s row should say
     "dictionary page of the target schema only, on demand".
- 2026-07-05 — plan `split-data-dictionary` applied proposal #1 above: the dictionary now
  lives in `docs/database/dictionary/` (`_index.md` + per-schema pages, mirror of `erd/`);
  the ETL and Admin CRUD rows were repointed to "index → target schema page"; `docs-sync`
  (user-level agent) now rewrites only the touched schema's page; `data-analyst` reads
  index → target schema.
- 2026-07-05 — applied proposals #2–#5: added the `docs/database/` entry-point rule
  (index → target schema, never the folder) and the already-injected-files rule
  (never Read `AGENTS.md`/`CLAUDE.md`/`STATE.md` by reflex) to Cross-type notes; added
  "Cross-phase (plan/commit ceremony)" for `_plan-template.md` / `pull_request_template.md`;
  added "Sub-agent routes (measured)" documenting `dba`/`docs-sync`/`data-analyst` baselines
  and updated the user-level `dba` agent instructions to read `dictionary/<schema>.md` only
  on demand, never the index alone or the whole folder.
- 2026-07-06 — docs-sync (plan production-schema-rename): DB schema `produccion` renamed to
  `production` (V12); `erd/produccion.md` → `erd/production.md` and
  `dictionary/produccion.md` → `dictionary/production.md`; the "Business module with
  temporal-bridge catalogs" row now points at `erd/production.md`.
- 2026-07-07 — docs-sync (plan org-schema-plant-process, V15): new `org` schema
  (`erd/org.md` + `dictionary/org.md`) holding `plant` (moved from `auth`),
  `process` (promoted from `maint`) and the new `plant_process` link. The
  "Admin CRUD" row now also reads `erd/org.md` for plant/process organizational
  work (plants are no longer in `erd/auth.md`). Process catalog administration
  moved from the maintenance module to the admin panel; `maintenance.process:*`
  permissions and the `/maintenance/process` nav item retired.
