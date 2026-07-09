# STATE — live project truth (EBI-Web)

> **Always-loaded digest.** Only what is *true now*: active milestone, live
> decisions not already in `AGENTS.md`, and non-trivial code conventions.
> **Rationale, history, alternatives, module internals, and risks live
> elsewhere** (see *Where the history lives* at the bottom) — read on demand.
>
> Keep ≤ ~90 lines. When a decision changes, edit *this* file first, then
> the plan/ADR.

## Active focus

- **Milestone 1 — Report admin portal** is built and live in `EBI_dev` /
  `origin/main`: auth, admin panel (Organización/Portal tabs), DB-driven nav
  with page-granular authz (ADR 0008), RBAC actions, maintenance CMMS (asset
  catalog, QR labels, documents), and production operative cells (V19:
  unified self-referencing `cell` hierarchy, replaces the old line/cell split).
- Nav section `maintenance` is active. `production` remains **dark-launched**:
  activation in `/admin/portal/permissions` is a pending human step.
- Branch convention: `<type>/<slug>` (`feat/`, `fix/`, `chore/`, `docs/`).
  Plans are not numbered — the slug is the identity, unique in the ledger
  (`docs/plans/README.md`).

## In-flight plans

None currently — see the ledger in `docs/plans/README.md` for history.

## Live decisions (current truth not already in AGENTS.md)

| Topic | Current decision |
|---|---|
| Admin UI | **Generic kit tables** (`src/components/kit/`: `data-table.tsx`, `grouped-data-table.tsx`, `page-tabs.tsx`, `entity-card.tsx`); per-entity modals; `/admin` = 2 tabbed groups (Organización / Portal) behind the shared `PortalSidebar` fed by the code-built `ADMIN_NAV_SECTION`. |
| Unproven modules | `(portal)/test/*` (founded 2026-07-06): admin-only proving ground, outside the nav registry, for modules whose portal-fit isn't settled. Promote by moving pages back + re-seeding the nav item. |

For stack, auth, data access, migrations, and hard rules, see
[AGENTS.md](../AGENTS.md) — do not repeat them here.

## Code conventions (non-trivial — violating them breaks things)

- **Auth.js: two files.** `auth.config.ts` is edge-safe (middleware, no
  Kysely/argon2); `auth.ts` is Node runtime (Credentials provider + DB
  callbacks). Mixing imports breaks the edge bundling.
- **Schemas are bound in one shared file, not per module.**
  `kysely-codegen` flattens schemas out of `DB` keys (`app_user`, not
  `auth.app_user`), so a bare table name resolves under `dbo` and throws 208
  unless the client is schema-bound. `src/lib/db/schema-clients.ts` is the
  single home for the four per-schema Kysely clients (`authDb`, `orgDb`,
  `maintDb`, `productionDb`) plus `emptyToNull`; every module imports the
  bound client it needs from there instead of calling `rootDb.withSchema(...)`
  locally. Cross-schema ref lookups shared by more than one module
  (location/process/asset identity) live the same way in `src/lib/db/refs.ts`
  (`locationRefsById`/`processNamesById`/`assetRefsById`, shared by
  `maintenance` and `production`). A `trx` inherits its schema.
- **MSSQL inserts use `.output("inserted.<pk>")`** — Kysely MSSQL doesn't
  populate `.insertId`.
- **Dependency direction (modules-first):** `app → modules → kit/ui/lib`,
  never the reverse; `kit`/`ui` never import modules or `lib/db`.
  `components/layout` is the one exception (composes `modules/navigation`).
- **One sidebar (`PortalSidebar`)**, rendered by `PortalShell` for both the
  portal and `/admin/*` (code-built `ADMIN_NAV_SECTION`) — no bespoke rail.
- **Page grants authorize pages** (ADR 0008): a route is reachable only if
  its page resolves visible; a section is derived-visible (≥1 visible page).
  Modules enforce via `requireSectionOrRedirect("<code>")` off the
  `x-pathname` header; `/admin/*` uses `assertAdminOrRedirect`.
- **`admin` role protection is app-layer only** (`RoleProtectedError`), not a
  CHECK constraint — covers name/state/deletion.
- **Mutations gate with `requirePermission("<module>.<resource>:<action>")`**
  (ADR 0004); `admin` bypasses with no grant rows; codes are contract — seed
  in the owning migration or the gate never passes for non-admins. `useCan()`
  is display-only. Live doc: [docs/modules/rbac.md](modules/rbac.md).

## Modules — where the code is

- `org/` — identity (`auth`) + organization (`org`: plant, process,
  location). [docs/modules/org.md](modules/org.md)
- `navigation/` — nav registry + page authz. [docs/modules/navigation.md](modules/navigation.md)
- `maintenance/` — CMMS (`maint`): assets, catalogs, QR, docs.
  [docs/modules/maintenance.md](modules/maintenance.md)
- `production/` — cells, layouts, placements (`production`).
  [docs/modules/production.md](modules/production.md)

Shared UI/infra/routes follow the layout in `AGENTS.md` and
`docs/architecture/module-blueprint.md`.

## Where the history lives (read on demand, not every session)

- **Past plans:** the ledger in [docs/plans/README.md](plans/README.md) —
  pruned plan files live in git history (`git log --follow`), never read
  them as live docs.
- **Portal-owned auth (rationale):**
  [ADR 0001](architecture/adr/0001-portal-owned-auth.md).
- **Configurability strategy (composition vs. metadata) + module recipe:**
  [ADR 0003](architecture/adr/0003-composition-over-metadata.md) +
  [module blueprint](architecture/module-blueprint.md).
- **DB current shape:** `docs/database/erd/_index.md` +
  `docs/database/dictionary/_index.md` (per-schema pages — index first, then
  only the target schema) + `docs/database/migrations-log.md`.
- **Rules of engagement:** [AGENTS.md](../AGENTS.md).
