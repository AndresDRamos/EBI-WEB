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
  `Procesos` items); page access is gated per **page** (ADR 0008, `role_nav_item`).
- Branch convention: `<type>/<slug>` (`feat/`, `fix/`, `chore/`, `docs/` per
  change type). Plans are not numbered: the slug is the plan's identity, unique
  in the ledger (`docs/plans/README.md`).

## In-flight plans

None currently — see *Where the history lives* for recently committed plans.

The new `org` schema (V15, plan org-schema-plant-process, ADR 0007) separates
organization from identity: `plant` moved from `auth`, `process` unified from
`maint`, + N:M `org.plant_process`; process admin lives in the admin panel
(Organización tabs). `user_plant`/`department`/`role` stay in `auth`.

The `production` nav section remains dark-launched: activation in
`/admin/portal/permissions` is a pending human step
(production-cell-assignment was committed 2026-07-03).

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
| Admin UI | **Generic kit tables** (`src/components/kit/`: `data-table.tsx`, `grouped-data-table.tsx`, `page-tabs.tsx`, `entity-card.tsx`); per-entity modals; the `/admin` panel = 2 tabbed groups (Organización / Portal, tabs as real routes) behind the shared `PortalSidebar` fed the code-built `ADMIN_NAV_SECTION` (no bespoke rail). |
| Repo layout | **Modules-first** (2026-07-02): `app/` = thin routing only; `modules/<m>/` owns each domain (db + components); `components/kit|ui|layout` shared UI; `lib/` domain-blind infra. Business-module APIs namespaced (`/api/maintenance/...`). |
| Unproven modules | `(portal)/test/*` (founded 2026-07-06): admin-only proving ground, outside the nav registry, for modules whose portal-fit isn't settled yet. First tenant: plant-layout (`docs/modules/production.md`). Promote by moving pages back + re-seeding the nav item. |

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
- **Page grants authorize pages (ADR 0008, supersedes 0005).** Nav authority is
  per **page** (V16 `auth.role_nav_item`): a user reaches a route only if the
  page owning it resolves visible; a **section is derived-visible** (≥1 visible
  page) and `role_nav_section` narrows to per-role section *order*. Each module
  enforces via `requireSectionOrRedirect("<code>")`
  (`modules/navigation/guard.ts`) — it gates the section *and* the specific
  page, reading the path from the `x-pathname` header the middleware injects.
  Middleware is default-deny for authn only (no per-prefix allowlist); `/admin/*`
  stays on `assertAdminOrRedirect`.
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

- `org/` — identity (`auth` schema) & organization (`org` schema: `plant`,
  `process`, `location` since V15/V18).
  - `db/users.ts` — `auth.app_user` + junctions + `invitation` + admin CRUD.
    Reads: `findAuthUserByUsername/ById`, `getUserRolesById`, `getUserScope`,
    `listUsers/WithNames`, `getUserDetail`. Writes: `createUser`,
    `updateUserAssignments`, `bumpTokenVersion`, `setUserPassword`,
    `createInvitation / accept / revoke`.
  - `db/org.ts` — `auth.role | department` CRUD (role protection) +
    `org.plant` CRUD. Exports `RoleProtectedError` and
    `PROTECTED_ROLE = "admin"`. `deleteRole` clears the profile's grants
    (`role_permission`, `role_nav_item`, `role_nav_section`) in-transaction
    (409 only for assigned users).
  - `db/locations.ts` — `org.location` CRUD (per-plant named locations —
    naves de producción, almacenes…, V18); 409 on FK when an asset or a
    production cell still references it.
  - `db/permissions.ts` — `auth.permission | role_permission`:
    `getPermissionCodesForRoles` (hot path for `requirePermission`), catalog
    list + replace-set grants for the panel.
  - `components/` — `users-table-page.tsx` (flat DataTable),
    `plants-locations-page.tsx` (GroupedDataTable Planta→Ubicaciones, V18 —
    replaces the old flat `plants-table-page.tsx`), `departments-roles-page.tsx`
    (GroupedDataTable: departments as groups, roles — UI label "Roles" — as
    child rows; synthetic "Sin departamento" group only while orphan roles
    exist), `permission-manager.tsx` (unified Permisos tab: one top filter bar
    (Rol ⇄ Usuario) drives both the `module.resource` × action matrix AND the
    page-granular nav tree — per-page visibility (`role_nav_item`) + per-role
    page order + per-role section order; ungranted sections sink to the end),
    `user-form.tsx`, `login-form.tsx`,
    `accept-invite-form.tsx`, `profile-view.tsx`, `change-password-form.tsx`.
- `navigation/` — DB-driven nav registry (`auth.nav_*`) + portal page authz.
  - `db.ts` — `getNavForUser(roleNames, isAdmin)` resolves topbar + nested
    sidebar (admin sees ALL sections including inactive ones — rendered
    dimmed/"oculta" by the topbar; non-admins get, per **page**, the active
    items granted via `role_nav_item`, and only sections with ≥1 visible page).
    Admin reads/writes: `listSections/Items`, `listSectionGrants`,
    `updateSection` (no `createSection` — sections are seeded by module
    migrations), `create/update/deleteItem`, `setSectionGrants`, the section
    duals `listRoleSectionGrants`/`setRoleSectionGrants`
    (`GET/PUT /api/roles/[id]/sections`, now section order), the page grants
    `listRoleItemGrants`/`setRoleItemGrants`/`grantItemToSectionRoles`
    (`GET/PUT /api/roles/[id]/items` + auto-grant on page create), and the
    guard registry reads `listActiveItemRefs`/`listSectionRefs`.
  - `cache.ts` — `getCachedNav` (`unstable_cache`, tag `"nav"`) + `navRoleKey`
    (sorted role-set cache key) + `getCachedNavRegistry` (role-independent
    href/section registry for the guard); shared by the portal layout, the
    home page and the guard.
  - `guard.ts` — `requireSectionOrRedirect(code)`: page-level authz (ADR 0008).
    Gates the section and the specific page (path from the `x-pathname` header
    the middleware injects); denied users redirect to `/`; reuses `getCachedNav`
    + `getCachedNavRegistry`.
  - `icons.tsx` (curated `lucide-react` map, incl. `Lock`/`KeyRound`),
    `pin-action.ts` / `pin-cookie.ts` (sidebar pin cookie).
  - `components/` — `portal-topbar.tsx`, `portal-sidebar.tsx`. The old
    Módulos-tab structure panels (`nav-sections-table-page.tsx`,
    `nav-items-panel.tsx`) are retired: `/admin/portal` is now a single
    screen (`admin/portal/permissions`, `permission-manager.tsx`) covering
    permissions, section access/order and nav structure CRUD (inline
    dialogs on a drag-and-drop tree) via one shared role filter.
- `maintenance/` — CMMS (`maint` schema). `db.ts` (assets are anchored to
  `location_id` (`org.location`, V18) — plant is DERIVED via the location,
  `plant_id` was dropped from `asset`; `asset_category`/`asset_type`
  configurable catalogs — the matrícula `code_prefix` and the process link
  (`asset_type_process`, N:M in DB, edited 1:1 in the UI) moved from category
  to TYPE, replacing the old per-asset `asset_process`; transactional
  matrícula generator `{type.code_prefix}-P{plant}-{NNNN}` keyed by
  (type, plant); restrictions; documents), `enums.ts` (status/restriction/
  doc-type CHECKs — pure module, no I/O; category/type/process labels come
  from the DB, no static enum), `qr.ts` (`buildAssetQrDataUrl`/
  `resolveBaseUrl` — the QR payload targets the layout-less `/asset/[code]`
  landing page since V18, not a portal route), `components/` —
  `machines-cards-page` (Equipos tab: header groups the active/inactive
  toggle with "Nuevo equipo" — h-9, matching the kit `DataTable` pairing;
  cards catalog, Filtros popover; card click/"+"/context-menu "Editar" all
  open the same `MachineModal` via the kit `ExpandingModal`, no page
  navigation), `machine-catalogs-page` ("Tipos de equipo" tab:
  `GroupedDataTable` "Categorías y tipos de equipo" — the type row carries
  prefijo + proceso), `machines-tabs` (shared `PageTabs` config, labels
  "Equipos" / "Tipos de equipo"), `machine-cards` (maps rows onto the kit
  `EntityCard` with `onExpand`, not `href`), `machine-modal` (the equipment
  detail/edit/create surface: large photo + identity fields with a
  Categoría→Tipo cascade; a boxed "Ubicación" section with a
  Planta→Ubicación→Celda cascade, each step filtering/revealing the next; a
  "Detalles" section — fecha de instalación, equipo padre, notas — behind a
  divider; header actions icon-only (QR/trash/pencil); tabs Mantenimiento
  (representative placeholders) / Documentación / Restricciones — no more
  Procesos/Ubicación tabs, `machine-badges.tsx` retired since status isn't
  shown), `machine-tabs` (now just `MantenimientoTab` + `DocumentosTab` +
  `RestriccionesTab`), `machine-form-dialog` (pure type exports only — the
  old `ParentSearchPanel` moved into `parent-picker-modal.tsx`, a `QrModal`-
  style dialog stacked over the equipment modal: search list + a compact
  read-only preview of the candidate, no edit/tabs/Detalles), `qr-modal`
  (in-modal QR preview; "Imprimir etiqueta" prints via a hidden iframe on the
  printable `/label` route instead of navigating), `machine-label`
  (printable QR, unchanged), `machine-standalone-view` (the QR landing
  page's content — same `MachineModal`, a `standalone` prop hides the back
  button). `hooks/use-machine-form.ts` (form state/submit; the `saved`
  snapshot owns `location_id`, not `plant_id`/`status`) and
  `hooks/use-asset-detail.ts` (on-demand fetch of restrictions/documents/
  assignments for the tabs).

**Shared UI** (`src/components/`):

- `kit/` — the stampable generics (ADR 0003): `data-table.tsx`
  (`DataTable<T>`: text/catalog filter, asc/desc/none sort, 50/page,
  internal scroll, soft/hard delete; exports `ActionsCell` +
  `ActiveInactiveToggle` for reuse), `grouped-data-table.tsx`
  (`GroupedDataTable<G,C>`: collapsible parent groups + child rows, CRUD on
  both levels, per-group add-child; no pagination), `page-tabs.tsx`
  (route-aware tab bar), `entity-form-dialog.tsx` (shared modal chrome),
  `entity-card.tsx` (`EntityCard` + `EntityCardGrid`: catalog card grids —
  code, status dot, badges, detail list, location footer; `onExpand` opens a
  shared-element modal instead of navigating, `href` still supported;
  currently only `maintenance` uses `onExpand`), `expanding-modal.tsx`
  (`ExpandingModal`: generic "shared element" shell over raw Radix Dialog
  primitives — expands from a clicked card/button's rect into a large
  centered surface across opening→open→closing phases; `useExpandingModal()`
  exposes `requestClose` (guarded by `closeDisabled`), `requestCloseForce`
  (bypasses the guard — for an explicit in-content "Cancelar", never for
  backdrop/Escape) and `opened` to children; `useOptionalExpandingModal()`
  for content that also renders standalone outside a modal), `table-utils.ts` (pure: NFD
  normalization, comparators, catalog intersection). Future:
  `ResourceTable/Form`, `Calendar`, `KpiCard`.
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
  users on public routes → `/`. Page-level authz lives in the module layouts
  (ADR 0008), not here; the middleware injects the `x-pathname` header they need.

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
  (`requireSectionOrRedirect("maintenance")`) + machines list (detail/edit/
  create live in a modal, not a route) + label + type catalog.
  `machines/[code]/page.tsx` is a redirect shim to
  `machines?asset=<code>` (opens the modal deep-linked) — kept alive because
  the production module's cell composition view links to it and QR labels
  printed before V18 encode that exact URL.
- `asset/[code]/page.tsx` — QR landing page, OUTSIDE the `(portal)` group on
  purpose (no topbar/sidebar): renders `MachineModal` standalone via
  `MachineStandaloneView`. New labels encode this URL (V18); auth still
  applies (middleware default-deny + an `auth()` check in the page).
- `api/` — core portal routes stay flat (`users`, `roles`, `plants`,
  `departments`, `nav`, `profile`, `invite`, `auth`); business-module routes
  are namespaced: `api/maintenance/{assets,asset-categories,asset-types}/**`,
  `api/org/{locations,processes}/**`, `api/production/{cells,assignments,
  layouts,footprints,placements}/**` (`cells/[id]/children/reorder` nested
  under `cells`; `lines` retired — V19 collapsed `production_line` into a
  self-referencing `cell.parent_cell_id` hierarchy).

## Where the history lives (read on demand, not every session)

- **Past plans:** the ledger in [docs/plans/README.md](plans/README.md) — pruned
  plan files live in git history (`git log --follow`), never read them as live docs.
- **Portal-owned auth (rationale):**
  [ADR 0001](architecture/adr/0001-portal-owned-auth.md).
- **Configurability strategy (composition vs. metadata) + module recipe:**
  [ADR 0003](architecture/adr/0003-composition-over-metadata.md) +
  [module blueprint](architecture/module-blueprint.md).
- **DB current shape:** `docs/database/erd/_index.md` +
  `docs/database/dictionary/_index.md` (per-schema pages — index first, then
  only the target schema) + `docs/database/migrations-log.md`.
- **Rules of engagement:** [AGENTS.md](../AGENTS.md).
