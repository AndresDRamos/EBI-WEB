# STATE — live project truth (EBI-Web)

> **Always-loaded digest.** Only what is *true now*: active milestone, live
> decisions, code conventions, and a file-by-file map of the code. It exists
> so agents stop re-reading plans and ERD for basic facts. **Rationale,
> history, alternatives, and risks live elsewhere** (see *Where the history
> lives* at the bottom) — read on demand.
>
> Keep ≤ ~80 lines. When a decision changes, edit *this* file first, then
> the plan/ADR.

## Active focus

- **Milestone 1 — Report admin portal** (auth + admin + dashboards),
  extended with plan 0003 (Admin Panel restructure, V4), plan 0004
  (Mantenimiento Fase A, V5/V6, **committed** 2026-07-02) and plan 0005
  (DB-driven nav registry, V7, **committed** 2026-07-02) — all live in
  `EBI_dev` and pushed to `origin/main`.
- Nav section `maintenance` still `is_active=0` (dark launch) — activate in
  `/admin/access` to expose the Mantenimiento module in the topbar.
- Branch convention: `feat/m{n}-<slug>`.

## In-flight plans

None currently — 0004 and 0005 were committed on 2026-07-02.

Next up (direction fixed 2026-07-02, plans not yet drafted — see
[ADR 0003](architecture/adr/0003-composition-over-metadata.md) and the
[module blueprint](architecture/module-blueprint.md)): **RBAC actions**
(`auth.permission` + role grants + `requirePermission`/`can()`) and **UI kit
extraction** (generic kit in `src/components/kit/` + typed resource
definitions). Both precede the next business module.

## Live decisions (current truth — supersedes the master plan where they differ)

| Topic | Current decision |
|---|---|
| Portal login | **Portal-owned credentials** (username/password, Auth.js v5). *Not* MSAL — see [ADR 0001](architecture/adr/0001-portal-owned-auth.md). |
| App stack | Next.js App Router + TS + **pnpm** (never npm/yarn). Tailwind + shadcn/ui (Radix). |
| Data access | **Kysely** only, inside `src/lib/db/`. No raw queries elsewhere. Types via `kysely-codegen`. |
| Migrations | **Flyway** pure SQL in `db/migrations/` (`V{n}__` / `R__`). Written by the `dba` sub-agent; a human runs `flyway migrate`. |
| Schemas | Medallion: `staging` (ETL landing) → `core` / `planeacion` (consumption). |
| ETL | EPS is **read-only**. Never write to EPS. |
| Admin UI | **Generic DataTable** (`src/components/kit/data-table.tsx`); per-entity modals; nested sidebar under `(portal)/admin` (PortalShell hides the global rail under `/admin`). |
| Repo layout | **Modules-first** (2026-07-02): `app/` = thin routing only; `modules/<m>/` owns each domain (db + components); `components/kit|ui|layout` shared UI; `lib/` domain-blind infra. Business-module APIs namespaced (`/api/maintenance/...`). |

## Code conventions (non-trivial — violating them breaks things)

- **Auth.js: two files.** `src/auth.config.ts` is **edge-safe** (consumed by
  the middleware, no Kysely / no argon2). `src/auth.ts` is **Node runtime**
  and adds the Credentials provider + DB-touching callbacks. Mixing imports
  breaks the edge bundling.
- **Schema `auth` is bound manually.** `kysely-codegen` flattens schemas out
  of the `DB` keys (`app_user`, not `auth.app_user`). Every module `db` file
  that touches `auth` must do `rootDb.withSchema("auth")` at the top (see
  `modules/org/db/users.ts`, `modules/org/db/org.ts`,
  `modules/navigation/db.ts`). Without it, SQL Server resolves under `dbo`
  and throws 208. `modules/reports/db.ts` accesses `dbo` and does **not**
  apply `.withSchema()`; `modules/maintenance/db.ts` binds `maint`.
- **MSSQL inserts use `.output("inserted.<pk>")`.** Kysely MSSQL does **not**
  populate `.insertId`; use `.output("inserted.id").executeTakeFirst()` and
  then `select` the row. Uniform pattern across `users.ts`, `org.ts`,
  `reports.ts`.
- **Transactions inherit the schema.** A `trx` created inside
  `withSchema("auth")` stays in `auth`; do not re-bind.
- **Dependency direction (modules-first).** `app/` imports from
  `modules`/`components`/`lib`, never the reverse. `modules/*` import `kit`,
  `ui`, `lib` — not `app/` nor (without justification) other modules.
  `components/kit` and `ui` never import from modules or `lib/db` — if a kit
  component needs a domain, it isn't kit (`kit/table-utils.ts` stays pure:
  NFD normalization, comparators, catalog intersection). `components/layout`
  is the one exception: it composes `modules/navigation` pieces.
- **SQL/Kysely lives only in `src/lib/db/` (infra: `client.ts` + generated
  `types.ts`) and `src/modules/*/db{.ts,/*.ts}`.** No queries anywhere else.
- **Global sidebar vs. panel sidebar.** `PortalShell` hides its rail when
  `pathname.startsWith("/admin")`; the panel sidebar is mounted by
  `(portal)/admin/layout.tsx`. No prop-drilling, no double rail.
- **Protected `admin` role is enforced at the app layer.** `RoleProtectedError`
  in `modules/org/db/org.ts`; the guard receives the `current` role loaded by
  the API before mutation. No CHECK constraint — the app is the only barrier.

## File-by-file map (what the code *is* today)

**Modules** (`src/modules/<m>/` — each domain owns its db + components;
the app pages under `src/app/` are thin and compose from here):

- `org/` — identity & organization (`auth` schema).
  - `db/users.ts` — `auth.app_user` + junctions + `invitation` + admin CRUD.
    Reads: `findAuthUserByUsername/ById`, `getUserRolesById`, `getUserScope`,
    `listUsers/WithNames`, `getUserDetail`. Writes: `createUser`,
    `updateUserAssignments`, `bumpTokenVersion`, `setUserPassword`,
    `createInvitation / accept / revoke`.
  - `db/org.ts` — `auth.role | plant | department` + CRUD with the `admin`
    guard. Exports `RoleProtectedError` and `PROTECTED_ROLE = "admin"`.
  - `components/` — `{users,roles,plants,departments}-table-page.tsx` (one
    client page per entity: column defs + modal state + delete handlers),
    `user-form.tsx`, `login-form.tsx`, `accept-invite-form.tsx`,
    `profile-view.tsx`, `change-password-form.tsx`.
- `reports/` — Power BI catalog (`dbo` schema, the only `dbo` layer).
  - `db.ts` — `dbo.report` + `dbo.report_category`; full CRUD +
    `adminListReports` joining category.
  - `components/` — `report-admin-table.tsx`, `report-form.tsx`,
    `category-manager.tsx` (Reportes admin is dormant pending embedding).
- `navigation/` — DB-driven nav registry (`auth.nav_*`).
  - `db.ts` — `getNavForUser(roleNames, isAdmin)` resolves topbar + nested
    sidebar (admin sees all active sections, no grant rows). Admin
    reads/writes: `listSections/Items`, `listSectionGrants`, `updateSection`
    (no `createSection` — sections are seeded by module migrations),
    `create/update/deleteItem`, `setSectionGrants`.
  - `icons.tsx` (curated `lucide-react` map), `pin-action.ts` /
    `pin-cookie.ts` (sidebar pin cookie).
  - `components/` — `portal-topbar.tsx`, `portal-sidebar.tsx`, and the
    `/admin/access` panels: `nav-{sections-table-page,items-panel,
    grants-panel}.tsx`.
- `maintenance/` — CMMS (`maint` schema). `db.ts` (assets, processes,
  restrictions, documents), `enums.ts` (mirrors the V5/V6 CHECKs — pure
  module, no I/O), `components/` — `machines-table-page`, `machine-detail`
  (Datos/Procesos/Restricciones/Documentos), `machine-form-dialog`,
  `machine-label` (printable QR), `processes-table-page`.

**Shared UI** (`src/components/`):

- `kit/` — the stampable generics (ADR 0003): `data-table.tsx`
  (`DataTable<T>`: text/catalog filter, asc/desc/none sort, 50/page,
  internal scroll, soft/hard delete), `entity-form-dialog.tsx` (shared modal
  chrome), `table-utils.ts` (pure: NFD normalization, comparators, catalog
  intersection). Future: `ResourceTable/Form`, `Calendar`, `KpiCard`.
- `layout/` — global chrome: `portal-shell.tsx` (composes
  `modules/navigation` topbar + sidebar, conditional under `/admin`, +
  `UserMenu`), `admin-panel-sidebar.tsx` (3 sections; "Usuarios" expands to
  users/roles/plants/departments).
- `ui/` — shadcn / Radix primitives: button, card, input, label, textarea,
  select, checkbox, table, badge, separator, dialog, alert-dialog,
  dropdown-menu, popover, tooltip.
- `providers/` — `auth-session-provider.tsx`.

**Infra** (`src/lib/`, domain-blind):

- `db/client.ts` — Kysely singleton + Azure SQL pool (Tarn, 1–10 conns).
- `db/types.ts` — **generated** by `kysely-codegen`; do not edit by hand.
- `auth/password.ts` — argon2id (`@node-rs/argon2`), Node only.
- `auth/rbac.ts` — `requireUser / requireAnyRole / isAdmin /
  assertAdminOrRedirect / getUserScope`. Errors: `UnauthenticatedError`,
  `ForbiddenError`.
- `auth/api.ts` — `authErrorResponse` (401/403), `parseJsonBody`.
- `storage/blob.ts` — Azure Blob (SAS downloads, server-side uploads).

**Auth entry points** (`src/auth*`, `src/middleware.ts`):

- `auth.config.ts` — edge-safe; no DB. `auth.ts` — Credentials provider,
  argon2id, JWT callbacks (`token_version` re-check for revocation).
- `middleware.ts` — gates `(portal)` and `/api/**`; redirects UI to
  `/login`, returns `401` for API.

**Routes** (`src/app/` — thin by rule):

- `page.tsx` → redirect `/dashboards`. `(auth)/login` + `(auth)/invite/
  [token]` compose `modules/org` forms.
- `(portal)/admin/*` — `layout.tsx` (`assertAdminOrRedirect` +
  `AdminPanelSidebar`), `page.tsx` → `/admin/users`; entity pages compose
  `modules/org`; `access/` composes `modules/navigation`; `reports/`,
  `reports/new`, `reports/[reportId]/edit` compose `modules/reports`.
- `(portal)/maintenance/*` — machines list/detail/label + process catalog.
- `api/` — core portal routes stay flat (`users`, `roles`, `plants`,
  `departments`, `reports`, `nav`, `profile`, `invite`, `auth`);
  business-module routes are namespaced: `api/maintenance/{assets,
  processes}/**`.

## Where the history lives (read on demand, not every session)

- **Past plans:** the ledger in [docs/plans/README.md](plans/README.md) — pruned
  plan files live in git history (`git log --follow`), never read them as live docs.
- **Portal-owned auth (rationale):**
  [ADR 0001](architecture/adr/0001-portal-owned-auth.md).
- **Configurability strategy (composition vs. metadata) + module recipe:**
  [ADR 0003](architecture/adr/0003-composition-over-metadata.md) +
  [module blueprint](architecture/module-blueprint.md).
- **DB current shape:** `docs/database/erd/_index.md` (per-schema pages) +
  `docs/database/{data-dictionary, migrations-log}.md`.
- **Rules of engagement:** [AGENTS.md](../AGENTS.md).
