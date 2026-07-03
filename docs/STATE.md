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
- Nav section `maintenance` is active and mapped (V9 seeded its `Máquinas` /
  `Procesos` items); page access is gated by the section grant (ADR 0005).
- Branch convention: `<type>/<slug>` (`feat/`, `fix/`, `chore/`, `docs/` per
  change type). Plans are not numbered: the slug is the plan's identity, unique
  in the ledger (`docs/plans/README.md`).

## In-flight plans

None currently — admin-panel-regroup (2 tabbed groups, kit `PageTabs` +
`GroupedDataTable`, roles grouped inside departments, permission matrix) was
committed on 2026-07-03 (PR to `main`).

Next up (direction fixed 2026-07-02 — see
[ADR 0003](architecture/adr/0003-composition-over-metadata.md) and the
[module blueprint](architecture/module-blueprint.md)): **UI kit extraction**
(generic kit in `src/components/kit/` + typed resource definitions). It and
RBAC actions precede the next business module.

## Live decisions (current truth — supersedes the master plan where they differ)

| Topic | Current decision |
|---|---|
| Portal login | **Portal-owned credentials** (username/password, Auth.js v5). *Not* MSAL — see [ADR 0001](architecture/adr/0001-portal-owned-auth.md). |
| App stack | Next.js App Router + TS + **pnpm** (never npm/yarn). Tailwind + shadcn/ui (Radix). |
| Data access | **Kysely** only, inside `src/lib/db/`. No raw queries elsewhere. Types via `kysely-codegen`. |
| Migrations | **Flyway** pure SQL in `db/migrations/` (`V{n}__` / `R__`). Written by the `dba` sub-agent; a human runs `flyway migrate`. |
| Schemas | Medallion: `staging` (ETL landing) → `core` / `planeacion` (consumption). |
| ETL | EPS is **read-only**. Never write to EPS. |
| Admin UI | **Generic kit tables** (`src/components/kit/`: `data-table.tsx`, `grouped-data-table.tsx`, `page-tabs.tsx`); per-entity modals; the `/admin` panel = 2 tabbed groups (Organización / Portal, tabs as real routes) behind the shared `PortalSidebar` fed the code-built `ADMIN_NAV_SECTION` (no bespoke rail). |
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
  and throws 208. `modules/maintenance/db.ts` binds `maint`.
- **MSSQL inserts use `.output("inserted.<pk>")`.** Kysely MSSQL does **not**
  populate `.insertId`; use `.output("inserted.id").executeTakeFirst()` and
  then `select` the row. Uniform pattern across `users.ts`, `org.ts` and the
  maintenance/nav db layers.
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
- **One sidebar component (`PortalSidebar`).** `PortalShell` renders it for
  the portal (active section from the registry) and for `/admin/*` (the
  code-built `ADMIN_NAV_SECTION`, `components/layout/admin-nav.ts`). No bespoke
  admin rail, no prop-drilling, no double rail.
- **Section grants authorize pages (ADR 0005).** A route is reachable only if
  its `nav_section` resolves visible for the user; each module enforces it in
  `(portal)/<module>/layout.tsx` via `requireSectionOrRedirect("<code>")`
  (`modules/navigation/guard.ts`, reuses `getCachedNav`). Middleware is
  default-deny for authn only (no per-prefix allowlist); `/admin/*` stays on
  `assertAdminOrRedirect`.
- **Protected `admin` role is enforced at the app layer.** `RoleProtectedError`
  in `modules/org/db/org.ts`; the guard receives the `current` role loaded by
  the API before mutation. No CHECK constraint — the app is the only barrier.
  Protection covers name/state/deletion only: `admin`'s `department_id` IS
  assignable (the permission/nav bypass keys on the role NAME).
- **Mutations gate with `requirePermission("<module>.<resource>:<action>")`**
  (V8/ADR 0004; GETs stay on `requireUser`/admin). `auth.role` = **access
  profile** (`department_id` NULL = cross-department); `admin` bypasses with
  no grant rows. Codes are contract: seed the permission in the module's
  migration or the gate never passes for non-admins. UI: `useCan()` from
  `PermissionsProvider` (display-only; may be stale — the API re-checks).
  Live doc: [docs/modules/rbac.md](modules/rbac.md).

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
    `deleteRole` clears the profile's grants in-transaction (409 only for
    assigned users).
  - `db/permissions.ts` — `auth.permission | role_permission`:
    `getPermissionCodesForRoles` (hot path for `requirePermission`), catalog
    list + replace-set grants for the panel.
  - `components/` — `users-table-page.tsx` + `plants-table-page.tsx` (flat
    DataTable pages), `departments-roles-page.tsx` (GroupedDataTable:
    departments as groups, roles — UI label "Roles" — as child rows;
    synthetic "Sin departamento" group only while orphan roles exist),
    `permission-matrix-panel.tsx` (matrix `module.resource` × action per
    role, "copiar de otro rol"), `user-form.tsx`, `login-form.tsx`,
    `accept-invite-form.tsx`, `profile-view.tsx`, `change-password-form.tsx`.
- `navigation/` — DB-driven nav registry (`auth.nav_*`) + portal page authz.
  - `db.ts` — `getNavForUser(roleNames, isAdmin)` resolves topbar + nested
    sidebar (admin sees ALL sections including inactive ones — rendered
    dimmed/"oculta" by the topbar; non-admins only get active granted
    sections). Admin
    reads/writes: `listSections/Items`, `listSectionGrants`, `updateSection`
    (no `createSection` — sections are seeded by module migrations),
    `create/update/deleteItem`, `setSectionGrants`.
  - `cache.ts` — `getCachedNav` (`unstable_cache`, tag `"nav"`) + `navRoleKey`
    (sorted role-set cache key); shared by the portal layout, the home page
    and the guard.
  - `guard.ts` — `requireSectionOrRedirect(code)`: page-level authz (ADR 0005).
    Denied users redirect to `/`; reuses `getCachedNav` so it inherits the
    exact topbar visibility rules.
  - `icons.tsx` (curated `lucide-react` map, incl. `Lock`/`KeyRound`),
    `pin-action.ts` / `pin-cookie.ts` (sidebar pin cookie).
  - `components/` — `portal-topbar.tsx`, `portal-sidebar.tsx`, and the
    Módulos tab panels (`/admin/portal/modules`):
    `nav-{sections-table-page,items-panel,grants-panel}.tsx`.
- `maintenance/` — CMMS (`maint` schema). `db.ts` (assets, processes,
  restrictions, documents), `enums.ts` (mirrors the V5/V6 CHECKs — pure
  module, no I/O), `components/` — `machines-table-page`, `machine-detail`
  (Datos/Procesos/Restricciones/Documentos), `machine-form-dialog`,
  `machine-label` (printable QR), `processes-table-page`.

**Shared UI** (`src/components/`):

- `kit/` — the stampable generics (ADR 0003): `data-table.tsx`
  (`DataTable<T>`: text/catalog filter, asc/desc/none sort, 50/page,
  internal scroll, soft/hard delete; exports `ActionsCell` +
  `ActiveInactiveToggle` for reuse), `grouped-data-table.tsx`
  (`GroupedDataTable<G,C>`: collapsible parent groups + child rows, CRUD on
  both levels, per-group add-child; no pagination), `page-tabs.tsx`
  (route-aware tab bar), `entity-form-dialog.tsx` (shared modal chrome),
  `table-utils.ts` (pure: NFD normalization, comparators, catalog
  intersection). Future: `ResourceTable/Form`, `Calendar`, `KpiCard`.
- `layout/` — global chrome: `portal-shell.tsx` (composes
  `modules/navigation` topbar + sidebar, rendering `PortalSidebar` for the
  portal *and* under `/admin/*` — fed `ADMIN_NAV_SECTION`; no longer hides the
  rail), `admin-nav.ts` (`ADMIN_NAV_SECTION`: the "Administración" panel as a
  code-built `ResolvedNavSection` with synthetic negative ids — not in the DB
  registry; keep reconciled with the real `/admin/*` pages).
- `ui/` — shadcn / Radix primitives: button, card, input, label, textarea,
  select, checkbox, table, badge, separator, dialog, alert-dialog,
  dropdown-menu, popover, tooltip.
- `providers/` — `auth-session-provider.tsx`, `permissions-provider.tsx`
  (`useCan`; codes loaded server-side in `(portal)/layout.tsx`, cache tag
  `"permissions"`).

**Infra** (`src/lib/`, domain-blind):

- `db/client.ts` — Kysely singleton + Azure SQL pool (Tarn, 1–10 conns).
- `db/types.ts` — **generated** by `kysely-codegen`; do not edit by hand.
- `auth/password.ts` — argon2id (`@node-rs/argon2`), Node only.
- `auth/rbac.ts` — `requireUser / requireAnyRole / requirePermission /
  isAdmin / assertAdminOrRedirect / getUserScope`. Errors:
  `UnauthenticatedError`, `ForbiddenError`.
- `auth/api.ts` — `authErrorResponse` (401/403), `parseJsonBody`.
- `storage/blob.ts` — Azure Blob (SAS downloads, server-side uploads).

**Auth entry points** (`src/auth*`, `src/middleware.ts`):

- `auth.config.ts` — edge-safe; no DB. `auth.ts` — Credentials provider,
  argon2id, JWT callbacks (`token_version` re-check for revocation).
- `middleware.ts` — **default-deny for authentication** (no per-prefix
  allowlist): unauthenticated UI → `/login`, `/api/**` → `401`; authenticated
  users on public routes → `/`. Page-level authz per section lives in the
  module layouts (ADR 0005), not here.

**Routes** (`src/app/` — thin by rule):

- No root `src/app/page.tsx`: the post-login landing is `(portal)/page.tsx`
  (home at `/`, grant-free; one card per section the user can reach, resolved
  from `getCachedNav`). `(auth)/login` + `(auth)/invite/[token]` compose
  `modules/org` forms.
- `(portal)/layout.tsx` — shell; consumes `getCachedNav`/`navRoleKey` from
  `modules/navigation/cache.ts` + loads permission codes.
- `(portal)/admin/*` — `layout.tsx` (only `assertAdminOrRedirect`, non-admin →
  `/`; the sidebar is rendered by `PortalShell` via `ADMIN_NAV_SECTION` — 2
  items: Organización, Portal), `page.tsx` → `/admin/organization/users`.
  Two tabbed groups (layout = header + kit `PageTabs`):
  `organization/{users,departments,plants}` and
  `portal/{modules,permissions}` compose `modules/org` /
  `modules/navigation`; the old flat routes
  (`users|roles|departments|plants|access|permissions`) are `redirect()`-only.
- `(portal)/maintenance/*` — `layout.tsx` guard
  (`requireSectionOrRedirect("maintenance")`) + machines list/detail/label +
  process catalog.
- `api/` — core portal routes stay flat (`users`, `roles`, `plants`,
  `departments`, `nav`, `profile`, `invite`, `auth`); business-module routes
  are namespaced: `api/maintenance/{assets,processes}/**`.

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
