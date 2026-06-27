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
- **Read always:** `docs/database/erd.md` · `docs/database/data-dictionary.md` · `docs/modules/etl-eps-ebi.md`
- **Read if:** `docs/database/migrations-log.md` (only if it touches schema) · ADR (only for rationale)
- **Skip (known noise):** ADR 0001 (auth) · `docs/modules/powerbi-admin.md`
- **Ask up front:** watermark column for incremental load? exact EPS source tables? `staging`→`core` ownership?
- **Gotchas:** EPS is read-only — never write to it. Verify docs↔live-schema drift via `ebi-sql-dev` MCP before designing.

### Auth / security
- **Read always:** `docs/architecture/adr/0001-portal-owned-auth.md`
- **Skip (known noise):** `docs/plans/0001-portal-bootstrap.md` — **STALE on auth** (still says MSAL); do not trust it here.
- **Ask up front:** session strategy already fixed? new roles/permissions needed?
- **Gotchas:** live truth = portal-owned credentials (Auth.js v5), **not** MSAL. Secrets only in `.env`/Key Vault.

### Power BI embedding / dashboards
- **Read always:** `docs/modules/powerbi-admin.md`
- **Read if:** ADR 0001 (for the deferral rationale) · `docs/architecture/overview.md` (embedding flow)
- **Skip (known noise):** ETL/DB docs unless the module also persists data.
- **Ask up front:** is embedding being reintroduced or still placeholder for this milestone?
- **Gotchas:** embedding is **deferred in v1**. Keep `src/lib/powerbi/` mode-agnostic (`Aad` dev / `Embed` prod); fork token acquisition, not the embed component.

### Admin CRUD (users, catalogs, report metadata)
- **Read always:** `docs/database/erd.md` · existing `src/lib/db/*.ts` + `src/app/api/**` for the entity (M2 already built users/plants/departments/reports CRUD — extend, don't rebuild)
- **Read if:** `docs/database/data-dictionary.md` (when adding/altering columns) · relevant `docs/modules/*.md` (only if one exists for the entity)
- **Skip (known noise):** ETL docs · ADR 0001 unless touching auth/roles · `docs/modules/powerbi-admin.md` (Reportes admin is dormant; don't refactor it for unrelated work).
- **Ask up front:** which least-privilege DB user runs this (`ebi_app`)? soft vs hard delete (and what does the inactive-view "permanent delete" do for referenced rows)? are any roles code-coupled — which are protected (only `admin`; `viewer` is normal CRUD)?
- **Gotchas:** all DB access through `src/lib/db/` (Kysely) — no raw queries elsewhere · the session JWT carries only `userId/username/display_name/roles/token_version` (NO email) — read profile fields server-side via `getUserDetail`, not from the session · catalog DELETEs 409 on FK by design (block referenced rows); user deletes cascade via the junction FKs.

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
