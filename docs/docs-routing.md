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
- **Read always:** `docs/database/erd/_index.md` (then the target schema page, e.g. `erd/etl.md`) · `docs/database/data-dictionary.md`
- **Read if:** `docs/database/migrations-log.md` (only if it touches schema) · ADR (only for rationale) · `docs/modules/etl-eps-ebi.md` *once it exists* (retired in the doc restructure; recreate when the ETL module is planned)
- **Skip (known noise):** ADR 0001 (auth)
- **Ask up front:** watermark column for incremental load? exact EPS source tables? `staging`→`core` ownership?
- **Gotchas:** EPS is read-only — never write to it. Verify docs↔live-schema drift via `ebi-sql-dev` MCP before designing.

### Auth / security
- **Read always:** `docs/architecture/adr/0001-portal-owned-auth.md`
- **Skip (known noise):** `docs/plans/0001-portal-bootstrap.md` — **STALE on auth** (still says MSAL); do not trust it here.
- **Ask up front:** session strategy already fixed? new roles/permissions needed?
- **Gotchas:** live truth = portal-owned credentials (Auth.js v5), **not** MSAL. Secrets only in `.env`/Key Vault.

### Power BI embedding / dashboards
- **Read always:** `src/lib/powerbi/` directly (no module doc today — `docs/modules/powerbi-admin.md` was retired in the doc restructure)
- **Read if:** ADR 0001 (for the deferral rationale)
- **Skip (known noise):** ETL/DB docs unless the module also persists data.
- **Ask up front:** is embedding being reintroduced or still placeholder for this milestone?
- **Gotchas:** embedding is **deferred in v1**. Keep `src/lib/powerbi/` mode-agnostic (`Aad` dev / `Embed` prod); fork token acquisition, not the embed component.

### Admin CRUD (users, catalogs, report metadata)
- **Read always:** `docs/database/erd/auth.md` (plus `erd/dbo.md` for reports) · the existing module slice `src/modules/<module>/db*.ts` + `src/app/api/**` for the entity (M2 already built users/plants/departments/reports CRUD — extend, don't rebuild)
- **Read if:** `docs/database/data-dictionary.md` (when adding/altering columns) · relevant `docs/modules/*.md` (only if one exists for the entity)
- **Skip (known noise):** ETL docs · ADR 0001 unless touching auth/roles · the dormant Reportes admin screens (don't refactor them for unrelated work).
- **Ask up front:** which least-privilege DB user runs this (`ebi_app`)? soft vs hard delete (and what does the inactive-view "permanent delete" do for referenced rows)? are any roles code-coupled — which are protected (only `admin`; `viewer` is normal CRUD)?
- **Gotchas:** all DB access through Kysely in `src/lib/db/` (infra) + `src/modules/*/db*.ts` — no raw queries elsewhere · the session JWT carries only `userId/username/display_name/roles/token_version` (NO email) — read profile fields server-side via `getUserDetail`, not from the session · catalog DELETEs 409 on FK by design (block referenced rows); user deletes cascade via the junction FKs.

### Layout / navigation
- **Read always:** `docs/modules/navigation.md`
- **Read if:** `docs/database/erd/auth.md` (only if touching the `nav_*` tables) · the relevant module's doc if seeding a new section
- **Skip (known noise):** ETL docs · ADR 0001 unless touching auth
- **Ask up front:** does the new section belong under `auth` role-priority visibility, or does it need public/no-role default?
- **Gotchas:** sections are seeded by the migration of the module that owns the route — never let the admin panel create a section from scratch. The `admin` role needs no grant rows (sees everything).

### Pure UI / no data
- **Read always:** relevant `docs/modules/*.md`
- **Skip (known noise):** all `docs/database/*` · ADR 0001 · ETL docs.
- **Ask up front:** does it reuse existing shadcn/ui components? EZI brand tokens applied?
- **Gotchas:** EZI identity — charcoal `#373a36`, orange `#ff5c35`, Montserrat, minimalist industrial.

## Cross-type notes

- `STATE.md` covers most "current truth" — reach for the master plan `0001` only for
  roadmap/risk rationale, and remember it is stale on auth.
- When a row's *Skip* or *Gotchas* keeps proving wrong, fix it here in the same session — this
  table is only worth its tokens if it stays honest.

## Change log

> Append-only. `/trace-map` logs proposed routing corrections here (measured route vs. the
> table above); a human or a later planning session folds accepted proposals into the rows.

- 2026-07-02 — manual repair: pointed rows at the per-schema ERD (`docs/database/erd/*.md`)
  and removed references to files retired by the doc restructure (`docs/database/erd.md`,
  `docs/modules/etl-eps-ebi.md`, `docs/modules/powerbi-admin.md`,
  `docs/architecture/overview.md`).
