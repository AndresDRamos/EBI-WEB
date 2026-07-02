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
  extended with plan 0003 (Admin Panel restructure, V4) and plan 0005
  (DB-driven nav registry, V7, **verified** 2026-07-02) — both live in
  `EBI_dev`.
- Branch convention: `feat/m{n}-<slug>`.

## In-flight plans

| Plan | Status | Touches | Owner |
|---|---|---|---|
| [0004-mantenimiento](plans/0004-mantenimiento.md) (Fase A) | **verified** (2026-07-02) — `pnpm lint && pnpm build` clean, QR runtime smoke-tested; ready for `/commit-plan`. Nav section `maintenance` still `is_active=0` (dark launch) — activate in `/admin/access` to expose | `maint` schema; `src/lib/db/maint.ts`; `src/lib/storage/blob.ts`; `src/lib/maintenance/enums.ts`; `/api/{assets,processes}/**`; `(portal)/maintenance/*`; `docs/modules/maintenance.md` | ARamos |
| [0005-layout](plans/0005-layout.md) | **verified** (2026-07-02) — `pnpm lint && pnpm build` clean, visual pass done; V7 applied in `EBI_dev` | `auth.nav_section/nav_item/role_nav_section`; `src/lib/db/nav.ts`; `src/lib/nav/{icons.tsx,pin-action.ts,pin-cookie.ts}`; `components/nav/*`; `(portal)/admin/access/*`; replaces `portal-shell.tsx` rail; `docs/modules/navigation.md` | ARamos |

## Live decisions (current truth — supersedes the master plan where they differ)

| Topic | Current decision |
|---|---|
| Portal login | **Portal-owned credentials** (username/password, Auth.js v5). *Not* MSAL — see [ADR 0001](architecture/adr/0001-portal-owned-auth.md). |
| App stack | Next.js App Router + TS + **pnpm** (never npm/yarn). Tailwind + shadcn/ui (Radix). |
| Data access | **Kysely** only, inside `src/lib/db/`. No raw queries elsewhere. Types via `kysely-codegen`. |
| Migrations | **Flyway** pure SQL in `db/migrations/` (`V{n}__` / `R__`). Written by the `dba` sub-agent; a human runs `flyway migrate`. |
| Schemas | Medallion: `staging` (ETL landing) → `core` / `planeacion` (consumption). |
| ETL | EPS is **read-only**. Never write to EPS. |
| Admin UI | **Generic DataTable** (`src/components/admin/data-table.tsx`); per-entity modals; nested sidebar under `(portal)/admin` (PortalShell hides the global rail under `/admin`). |

## Code conventions (non-trivial — violating them breaks things)

- **Auth.js: two files.** `src/auth.config.ts` is **edge-safe** (consumed by
  the middleware, no Kysely / no argon2). `src/auth.ts` is **Node runtime**
  and adds the Credentials provider + DB-touching callbacks. Mixing imports
  breaks the edge bundling.
- **Schema `auth` is bound manually.** `kysely-codegen` flattens schemas out
  of the `DB` keys (`app_user`, not `auth.app_user`). Every module under
  `src/lib/db/` that touches `auth` must do `rootDb.withSchema("auth")` at
  the top (see `users.ts:12`, `org.ts:9`). Without it, SQL Server resolves
  under `dbo` and throws 208. `reports.ts` accesses `dbo` and does **not**
  apply `.withSchema()`.
- **MSSQL inserts use `.output("inserted.<pk>")`.** Kysely MSSQL does **not**
  populate `.insertId`; use `.output("inserted.id").executeTakeFirst()` and
  then `select` the row. Uniform pattern across `users.ts`, `org.ts`,
  `reports.ts`.
- **Transactions inherit the schema.** A `trx` created inside
  `withSchema("auth")` stays in `auth`; do not re-bind.
- **`src/lib/admin/` ≠ `src/lib/db/`.** `table-utils.ts` (pure utilities:
  NFD normalization, comparators, catalog intersection) lives in `admin/`
  precisely so it never imports from `db/`. If you need I/O, it goes in
  `db/`.
- **Global sidebar vs. panel sidebar.** `PortalShell` hides its rail when
  `pathname.startsWith("/admin")`; the panel sidebar is mounted by
  `(portal)/admin/layout.tsx`. No prop-drilling, no double rail.
- **Protected `admin` role is enforced at the app layer.** `RoleProtectedError`
  in `org.ts:146`; the guard receives the `current` role loaded by the API
  before mutation. No CHECK constraint — the app is the only barrier.

## File-by-file map (what the code *is* today)

**Data layer** (`src/lib/db/`, the only place with SQL):

- `client.ts` — Kysely singleton + Azure SQL pool (Tarn, 1–10 conns).
- `types.ts` — **generated** by `kysely-codegen`; do not edit by hand.
- `users.ts` — `auth.app_user` + junctions + `invitation` + admin CRUD.
  Reads: `findAuthUserByUsername/ById`, `getUserRolesById`, `getUserScope`,
  `listUsers/WithNames`, `getUserDetail`. Writes: `createUser`,
  `updateUserAssignments`, `bumpTokenVersion`, `setUserPassword`,
  `createInvitation / accept / revoke`.
- `org.ts` — `auth.role | plant | department` + CRUD with the `admin`
  guard. Roles: `listRoles / createRole / updateRole / softDeleteRole /
  deleteRole / findRoleById`. Plants and departments: list / create /
  update / delete + `is_active`. Exports `RoleProtectedError` and
  `PROTECTED_ROLE = "admin"`.
- `reports.ts` — `dbo.report` + `dbo.report_category` (the only `dbo`
  layer). Full CRUD + `adminListReports` joining category.
- `nav.ts` — `auth.nav_section/nav_item/role_nav_section`.
  `getNavForUser(roleNames, isAdmin)` resolves the topbar + nested sidebar
  (admin sees all active sections, no grant rows needed). Admin reads/writes:
  `listSections/Items`, `listSectionGrants`, `updateSection` (no
  `createSection` — sections are seeded by module migrations), `create/update/
  deleteItem`, `setSectionGrants`. `src/lib/nav/icons.ts` (curated
  `lucide-react` map) and `src/lib/nav/pin-action.ts` (sidebar pin cookie)
  round out the nav layer.

**Auth layer** (`src/auth*`, `src/lib/auth/`, `src/middleware.ts`):

- `src/auth.config.ts` — edge-safe; no DB.
- `src/auth.ts` — Credentials provider, argon2id, JWT callbacks (includes
  the `token_version` re-check for revocation).
- `src/middleware.ts` — gates `(portal)` and `/api/**`; redirects UI to
  `/login`, returns `401` for API.
- `src/lib/auth/password.ts` — argon2id (`@node-rs/argon2`), Node only.
- `src/lib/auth/rbac.ts` — `requireUser / requireAnyRole / isAdmin /
  assertAdminOrRedirect / getUserScope`. Errors: `UnauthenticatedError`,
  `ForbiddenError`.
- `src/lib/auth/api.ts` — `authErrorResponse` (maps to 401 / 403),
  `parseJsonBody`.

**Admin UI layer** (`src/components/admin/`, `src/app/(portal)/admin/`,
`src/app/api/{users,roles,plants,departments,reports,profile,invite}/`):

- `components/admin/data-table.tsx` — generic `DataTable<T>`; text /
  catalog filter, asc / desc / none sort, 50/page, internal scroll,
  soft / hard delete.
- `components/admin/entity-form-dialog.tsx` — shared modal chrome
  (title, body slot, footer, error / busy).
- `components/admin/admin-panel-sidebar.tsx` — 3 sections; "Usuarios"
  expands to users / roles / plants / departments.
- `components/admin/{users,roles,plants,departments}-table-page.tsx` —
  one client page per entity: column defs + modal state + delete handlers.
- `components/admin/nav-{sections-table-page,items-panel,grants-panel}.tsx` —
  `/admin/access` screen: edit section label/icon/order/active, manage items,
  edit role grants + priority (no section creation — see `nav.ts` above).
- `components/portal-shell.tsx` — composes `components/nav/{portal-topbar,
  portal-sidebar}.tsx`: DB-driven topbar + per-section sidebar from
  `getNavForUser` (replaces the old static `navItems` array), conditional
  sidebar (hidden under `/admin`) + `UserMenu` on shadcn `DropdownMenu`
  (Mi perfil, Panel admin [admin-only], Cerrar sesión).
- `app/(portal)/admin/layout.tsx` — `assertAdminOrRedirect` +
  `AdminPanelSidebar`.
- `app/(portal)/admin/page.tsx` — redirect → `/admin/users`.
- `app/(portal)/admin/access/page.tsx` — nav registry management (real
  screen, not a placeholder — see `nav-*-panel.tsx` above).
- `app/api/profile/password/route.ts` — self-service password change
  (verify → set → `bumpTokenVersion`).

**Landing / login / invitation** (`src/app/(auth)/`,
`src/app/api/auth/`, `src/app/api/invite/`):

- `app/page.tsx` — redirect to `/dashboards`.
- `app/(auth)/login/page.tsx` + `components/auth/login-form.tsx` —
  `signIn("credentials")` against `auth.ts`.
- `app/(auth)/invite/[token]/page.tsx` +
  `components/auth/accept-invite-form.tsx` — sets the password and
  activates the user via `acceptInvitation`.

**UI primitives** (`src/components/ui/`) — all shadcn / Radix: button,
card, input, label, textarea, select, checkbox, table, badge, separator,
dialog, alert-dialog, dropdown-menu, popover, tooltip.

## Where the history lives (read on demand, not every session)

- **Master plan + roadmap + risks:**
  [docs/plans/0001-portal-bootstrap.md](plans/0001-portal-bootstrap.md).
- **Admin Panel restructure (DataTable + V4):**
  [docs/plans/0003-admin-panel-restructure.md](plans/0003-admin-panel-restructure.md).
- **Portal-owned auth (rationale):**
  [ADR 0001](architecture/adr/0001-portal-owned-auth.md).
- **Architecture diagram + env matrix:**
  [docs/architecture/overview.md](architecture/overview.md).
- **DB current shape:** `docs/database/{erd, data-dictionary,
  migrations-log}.md`.
- **Rules of engagement:** [AGENTS.md](../AGENTS.md).
