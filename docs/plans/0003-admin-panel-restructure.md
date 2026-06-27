# 0003 — Admin Panel UX restructure (generic DataTable + dedicated panel shell)

- **Status:** Approved — 2026-06-27
- **Author:** Claude (planner) + architect/dba sub-agents
- **Related ADRs:** 0001 (portal-owned-auth) — no new ADR needed; this is a UX/structure change, not an architectural pivot.

## Context

M2 shipped admin as flat, tab-navigated pages (`/admin`, `/admin/users`, `/admin/plants`,
`/admin/departments`), where each entity has a bespoke table (`admin-users-table`,
`plants-manager`, `departments-manager`, `report-admin-table`) and create/edit happen on dedicated
pages (`/admin/users/new`, `/admin/users/[id]`).

The goal is a coherent **Admin Panel** reached from the avatar dropdown, with its own sidebar, a
single **generic reusable DataTable** for every sub-page, modal-based create/edit, per-column
filter/sort, fixed 50/page pagination with internal scroll (sticky header and footer), plus a
self-service **Mi perfil** page. Only the **Usuarios** section is implemented now; the other two
panel sections are placeholders.

## Confirmed decisions

| Topic | Decision |
|---|---|
| Entry point | Avatar dropdown, in order: **Mi perfil**, **Panel de administración** (admin-only), **Cerrar sesión**. Rebuild `UserMenu` on shadcn `DropdownMenu`. |
| Panel structure | Dedicated nested layout under `(portal)/admin` with its **own left sidebar**, replacing the global portal sidebar inside the panel. |
| Panel sidebar order | (1) Usuarios, (2) Configuración de accesos a módulos *(placeholder)*, (3) Catálogo de reportes Power BI *(placeholder)*. |
| Usuarios sub-pages | Usuarios, Roles, Plantas, Departamentos — each one a `DataTable`. |
| Editing | Dynamic **modal** per entity; the `users/new` and `users/[id]` pages are removed. |
| Roles | Protected catalog: only `admin` cannot be deleted/deactivated/renamed; description editable; `viewer` and all other roles are normal CRUD; new roles allowed. Adds `is_active` to `role`. |
| Delete | Active mode: trash = soft delete (`is_active=false`) + confirm. Inactive mode: trash = **permanent** + warning modal; **blocked (409) if referenced**; users cascade. |
| Mi perfil | View name/username/email/roles/plants/departments + self password change (reuses `hashPassword`/`verifyPassword`). |
| Filter/sort/paging | **Client-side** over the full result set (small volumes, 50/page). |
| `/admin` | Redirects to `/admin/users` (no overview page; no useful content yet). |

## Scope / out of scope

- **In scope:** avatar dropdown; panel route group + nested sidebar layout; generic `DataTable`
  (filter/sort/paginate/actions/modals); the four Usuarios sub-pages; per-entity modal form bodies;
  Mi perfil + password-change API; data-layer additions (plant/department names, role CRUD,
  `role.is_active`, `plant.address`/`postal_code`, `department.description`, soft/hard delete);
  the V4 migration (dba).
- **Out of scope:** the two placeholder panel sections; refactoring the existing Reportes admin
  (only relocated as a placeholder, not migrated to DataTable); Power BI embedding; email delivery
  of invitations.

## Design

### 1. Route structure — nested layout, sidebar swap by layout

Stay inside the `(portal)` route group. Add a **nested layout** `src/app/(portal)/admin/layout.tsx`
that runs `assertAdminOrRedirect` once for all sub-pages and renders the **panel sidebar** beside
`{children}`.

Sidebar swap (avoids a double rail without prop-drilling): the header (logo + avatar menu) stays
global in `PortalShell`, but its **global sidebar becomes conditional** — hidden when `pathname`
starts with `/admin`. The admin nested layout supplies the panel sidebar. Net: header always
global; left rail is global on `/dashboards`, panel-specific on `/admin`.

Routes (all admin-guarded by the nested layout, except `/profile`):

- `/admin` → redirects to `/admin/users`.
- `/admin/users`, `/admin/roles`, `/admin/plants`, `/admin/departments` → the four DataTable sub-pages.
- `/admin/access` → placeholder ("Configuración de accesos a módulos").
- `/admin/reports` → relocated Reportes content as the "Catálogo de reportes Power BI" placeholder
  (reuses existing components, no refactor).
- `/profile` → Mi perfil, in `(portal)` (any authenticated user, not only admins).

Panel sidebar: 3 sections; "Usuarios" expands its four sub-pages (static nested list — admin volume
is tiny, no collapse-state persistence needed) when any `/admin/(users|roles|plants|departments)`
route is active.

### 2. Generic `DataTable` — contract and behavior

One client component `src/components/admin/data-table.tsx`, generic over the row type `T`. Owns: the
header band (icon + title + subtitle left; (+) add + active/inactive toggle right), per-column
filter + sort headers, body, unlabeled actions column, internal-scroll layout (sticky thead/footer),
and the 50/page paginator.

Column definition (declarative, one array per sub-page):

```ts
type ColumnFilter =
  | { kind: "none" }
  | { kind: "text" }                                                   // open / approximate substring
  | { kind: "catalog"; options: { value: string; label: string }[] }; // closed catalog multi-select

interface ColumnDef<T> {
  key: string;                                          // sort/filter state id
  header: string;
  accessor: (row: T) => string | number | string[];    // value for sort + filter
  render?: (row: T) => React.ReactNode;                 // cell renderer (badges, etc.)
  sortable?: boolean;                                   // default true
  filter?: ColumnFilter;                                // default none
  className?: string;
}
```

Key props: `icon`, `title`, `subtitle`, `rows`, `getRowId`, `columns`, `isActive(row)`, `onAdd()`,
`onEdit(row)`, `onSoftDelete?(row)`, `onHardDelete?(row)`, `canEdit?(row)`, `canDelete?(row)`,
`pageSize=50`.

Internals, all client-side:

- **Active/inactive toggle** filters by `isActive`; the trash icon and its tooltip flip meaning
  (soft vs hard) with the mode.
- **Filtering** via a per-column `Popover`. `text` → diacritics/case-insensitive substring;
  `catalog` → multi-select checklist (a row passes if the accessor — string or any element of a
  `string[]` — intersects the selection). State: `Record<columnKey, string | string[]>`.
- **Sorting**: single `{ key, dir }`; click cycles asc/desc/none; comparator from `accessor`
  (numeric, `localeCompare("es")`, arrays by joined value).
- **Pagination**: applied after filter+sort; slice by 50; footer shows range + prev/next; resets to
  page 1 when filter/sort changes.
- **Internal scroll**: outer card `flex flex-col`, height-capped to the viewport
  (`max-h-[calc(100vh - header - chrome)]`); only the middle table region scrolls, with
  `thead sticky top-0`; the header band and paginator sit outside the scroll region. No
  layout-level scrollbar.
- **Actions column** (no header): pencil → `onEdit`; trash → soft/hard per mode, respecting
  `canEdit`/`canDelete`. Permanent delete routes through `AlertDialog`; soft delete through the same
  with lighter copy. API 409 (referenced) errors render inline in the dialog.

**Modal ownership:** `DataTable` does NOT own form contents — it only fires `onAdd`/`onEdit`. Each
sub-page owns its `Dialog` + strongly-typed entity form body and submit/API logic, keeping the table
fully generic. A shared `EntityFormDialog` standardizes the chrome (title, body slot, footer
buttons, error/busy slot); each entity passes its fields as children.

**Client vs server — recommendation: client-side.** Catalogs are dozens of rows; users likely low
hundreds. Each sub-page already loads its full set in one server fetch. Client-side gives instant
interaction, no extra endpoints, and trivially satisfies "table height never exceeds page height
with internal scroll" since data is in memory. The `accessor` contract maps cleanly to future
`?page&q&sort` params if Usuarios ever exceeds a few thousand.

### 3. New shadcn/ui primitives

Add (none exist today): **Dialog**, **AlertDialog**, **DropdownMenu**, **Popover**; optional
**Tooltip** for the unlabeled icons (actions/filter/sort). All in `src/components/ui/`. They pull
`@radix-ui/react-{dialog,alert-dialog,dropdown-menu,popover,tooltip}`. Justification: these are the
standard accessible headless primitives shadcn wraps; rebuilding focus-trap/aria by hand (as
`UserMenu` does today) is exactly the debt this restructure removes. Style to brand
(`ezi-gray`/`ezi-orange`). No bespoke Pagination component — the DataTable footer uses `Button`.

### 4. Data layer + API gaps (confirmed against code/ERD)

1. **Usuarios columns need names.** `listUsers()` returns `plant_ids`/`department_ids`; the spec
   shows Departamento(s)/Planta(s) as names (roles already come as names). → Add
   `listUsersWithNames()` joining plant/department names with the existing batched pattern.
2. **Roles need `is_active` + description CRUD.** `role` has no `is_active`; `org.ts` only has
   `listRoles()`. → V4 adds `auth.role.is_active`; add `createRole/updateRole/softDeleteRole/
   deleteRole` with a protected-role guard (reject rename/deactivate/delete only of `admin`;
   `viewer` and the rest are normal CRUD).
3. **Plants need `address` + `postal_code`.** → V4 adds both (nullable); extend
   `createPlant/updatePlant` and the plants API.
4. **Departments need `description`.** → V4 adds the column; extend `createDepartment/
   updateDepartment` and the departments API.
5. **Soft vs hard delete.** Standardize: PUT/PATCH `is_active` = soft; DELETE = hard (already 409s
   on FK for plants/departments). Roles get the same.
6. **Self-service password change.** None exists. → `POST /api/profile/password` (any authenticated
   user): `verifyPassword` current → `hashPassword` new → `setUserPassword(userId, hash, false)` →
   `bumpTokenVersion`. Read profile via existing `getUserDetail` (already returns
   email/roles/plants/departments).
7. **Roles API.** → Add `/api/roles` (GET/POST) and `/api/roles/[id]` (PUT/DELETE) following the
   plants/departments handler pattern + protected-role guard.

All new queries stay in `src/lib/db/` (`users.ts`, `org.ts`); APIs reuse `requireAnyRole(["admin"])`
/ `requireUser`, `authErrorResponse`, `parseJsonBody`.

### 5. Reuse vs. remove

- **Replace with DataTable:** `admin-users-table`, `plants-manager`, `departments-manager` →
  `DataTable` + per-page column defs + modals; delete after migration.
- **Reuse form logic:** `user-form.tsx` becomes the Usuarios modal body (its `MultiSelect`, payload
  assembly, and invite-link panel are reusable); adapt success to close + `router.refresh()` instead
  of `router.push("/admin/users")`. New small form bodies for Roles/Plants/Departments reuse
  `Input`/`Label`/`Checkbox`.
- **Keep (relocate only):** `report-admin-table`, `category-manager`, `report-form`, and the `/admin`
  Reportes content → moved under the panel as the Reportes placeholder; not refactored.
- **Remove:** `admin-nav.tsx`, `admin-users-table.tsx`, `plants-manager.tsx`,
  `departments-manager.tsx`, the `/admin/users/new` and `/admin/users/[id]` pages. The hand-rolled
  `UserMenu` dropdown is replaced by shadcn `DropdownMenu`.
- **Reuse data helpers as-is:** `getUserDetail`, `listRoles/listPlants/listDepartments`,
  `createInvitation`, `hashPassword/verifyPassword/setUserPassword/bumpTokenVersion`, RBAC/api
  helpers.

## Per-file changes

**New — UI primitives**

- `src/components/ui/dialog.tsx` — modal chrome for create/edit.
- `src/components/ui/alert-dialog.tsx` — soft-delete confirm + permanent-delete warning.
- `src/components/ui/dropdown-menu.tsx` — accessible avatar menu (retires hand-rolled logic).
- `src/components/ui/popover.tsx` — per-column filter UI.
- `src/components/ui/tooltip.tsx` *(optional)* — label the unlabeled icons.

**New — panel framework**

- `src/app/(portal)/admin/layout.tsx` — admin guard + renders `AdminPanelSidebar` + `{children}`.
- `src/components/admin/admin-panel-sidebar.tsx` — panel sidebar (3 sections; Usuarios expands; active highlight).
- `src/components/admin/data-table.tsx` — the generic `DataTable<T>`.
- `src/components/admin/entity-form-dialog.tsx` — Dialog wrapper (title/body/footer/error/busy).
- `src/lib/admin/table-utils.ts` — pure helpers (diacritics-insensitive match, comparator factory, catalog intersection); no `src/lib/db` dependency.

**New — Usuarios sub-pages** (server page loads data → client table + modal)

- `src/app/(portal)/admin/users/page.tsx` — rewrite: `listUsersWithNames()` + catalogs → Usuarios DataTable (Nombre/Usuario/Departamento(s)/Rol(es)/Planta(s)) + user modal.
- `src/components/admin/users-table-page.tsx` — column defs + modal state + adapted `UserForm` + delete handlers.
- `src/app/(portal)/admin/roles/page.tsx` *(new route)* — Roles DataTable (Nombre, Descripción) + role modal.
- `src/components/admin/roles-table-page.tsx` — role column defs, `canEdit/canDelete` that protects only `admin`, role form body.
- `src/app/(portal)/admin/plants/page.tsx` — rewrite to DataTable (Nombre, código, dirección, código postal) + plant modal.
- `src/components/admin/plants-table-page.tsx` — plant column defs + form body (code/name/address/postal_code).
- `src/app/(portal)/admin/departments/page.tsx` — rewrite to DataTable (Nombre, Descripción) + dept modal.
- `src/components/admin/departments-table-page.tsx` — dept column defs + form body (name/description).
- `src/app/(portal)/admin/access/page.tsx` *(new)* — placeholder section.
- `src/app/(portal)/admin/reports/page.tsx` *(new)* — relocated Reportes content (reuses `ReportAdminTable`/`CategoryManager`).
- `src/app/(portal)/admin/page.tsx` — change to redirect → `/admin/users`.

**New — Mi perfil**

- `src/app/(portal)/profile/page.tsx` — server page: `getUserDetail(userId)` → profile view + password form.
- `src/components/profile/profile-view.tsx` — read-only profile (name/username/email/roles/plants/departments).
- `src/components/profile/change-password-form.tsx` — current/new/confirm → `/api/profile/password`.
- `src/app/api/profile/password/route.ts` — `POST` (authenticated): verify, set, bump token_version.
- `src/app/api/roles/route.ts` — `GET`/`POST`.
- `src/app/api/roles/[id]/route.ts` — `PUT` (desc/is_active + protected guard) / `DELETE` (hard, 409 on FK).

**Modified**

- `src/components/portal-shell.tsx` — (a) rebuild `UserMenu` on `DropdownMenu` with the 3 items (Panel admin-only); (b) hide the global sidebar when the path starts with `/admin`.
- `src/lib/db/users.ts` — add `listUsersWithNames()`; reuse `getUserDetail` for the profile.
- `src/lib/db/org.ts` — add role CRUD + protected guard + `is_active`; extend plant create/update with `address`/`postal_code`; extend department create/update with `description`; `listRoles` returns `is_active`/`description`.
- `src/lib/db/types.ts` — regenerated by `kysely-codegen` after the migration (not hand-edited).
- `src/app/api/plants/route.ts` + `.../plants/[id]/route.ts` — accept `address`/`postal_code`.
- `src/app/api/departments/route.ts` + `.../departments/[id]/route.ts` — accept `description`.
- `src/components/admin/user-form.tsx` — adapt for modal (close + `router.refresh()` on success; keep invite-link panel; drop `router.push`).

**Removed**

- `src/components/admin/admin-nav.tsx`, `admin-users-table.tsx`, `plants-manager.tsx`, `departments-manager.tsx`.
- `src/app/(portal)/admin/users/new/page.tsx`, `src/app/(portal)/admin/users/[id]/page.tsx`.

## Migrations / ERD

`dba` confirmed via MCP that the live schema matches the dictionary (no drift). Next Flyway version =
**V4**.

- `db/migrations/V4__user_admin_catalog_columns.sql` (V3 style: commented header,
  `SET ANSI_NULLS/QUOTED_IDENTIFIER`, `GO` batches, `COL_LENGTH` idempotency guards):
  - `auth.role` ADD `is_active BIT NOT NULL CONSTRAINT DF_role_active DEFAULT (1)`. **dba
    recommendation:** keep `role` minimal (just `is_active`, no timestamps; it is a near-static
    catalog). Only `admin` is protected at the app layer, not via a CHECK constraint.
  - `auth.department` ADD `description NVARCHAR(256) NULL`.
  - `auth.plant` ADD `address NVARCHAR(256) NULL`, `postal_code NVARCHAR(16) NULL`.
- **No new indexes/constraints; no back-fill** (new text columns are nullable; `role.is_active`
  NOT NULL DEFAULT 1 fills existing rows with 1).
- ERD impact: `role` +`is_active`; `plant` +`address`,+`postal_code`; `department` +`description`.
  No new tables/relationships. ERD/dictionary/migrations-log updated alongside this plan; a human
  runs `flyway -configFiles=db/flyway.dev.conf migrate` and validates.
- **Post-migrate (OpenCode, not DBA):** run `kysely-codegen` to sync `src/lib/db/types.ts` with the
  4 new columns (all additive/optional; nothing existing breaks).

## Roadmap / milestones

- **M-A:** shadcn primitives + `PortalShell` dropdown + `/profile` + password API (independent,
  shippable).
- **M-B:** V4 migration (dba) + data-layer/API extensions (names, role CRUD, new columns).
- **M-C:** `DataTable` + `EntityFormDialog` + `table-utils`.
- **M-D:** the four Usuarios sub-pages + panel layout/sidebar; remove old components/pages; relocate
  the Reportes placeholder.

## Verification

- `pnpm lint && pnpm build` pass.
- After the migration: clean `flyway info`; `/sync-docs` regenerates ERD/dictionary; regenerate
  Kysely types.
- Manual: avatar menu items correct per role; panel sidebar swaps in on `/admin` and the global
  sidebar hides; each table filters/sorts/paginates at 50/page with only the body scrolling (no page
  scrollbar); add/edit modals work; soft delete (active mode) deactivates, hard delete (inactive
  mode) warns and 409s when referenced; the `admin` role cannot be renamed/deleted/deactivated but
  `viewer` can; Mi perfil shows the profile and changes the password (other sessions invalidated via
  token_version bump); a non-admin hitting `/admin/*` is redirected.

## Risks / notes

- **Sticky `thead` + footer with internal scroll** is the fiddliest CSS; budget time for the
  `calc(100vh - …)` height cap so it holds across breakpoints without a layout scrollbar. Cap height
  on the scroll region only; keep the header band + paginator outside it.
- **Generic-but-typed**: keep generics at the per-entity page wrapper so each `ColumnDef<T>` and
  modal stays type-safe; avoid an over-abstracted "modal schema engine" — per-entity form bodies are
  simpler and safer.
- **New Radix deps (4–5)**: justified as the standard shadcn primitives; they retire the hand-rolled
  a11y in `UserMenu`.
- **Hard delete of users cascades** — verify the FKs (`user_role/user_plant/user_department/
  invitation`) have `ON DELETE CASCADE` (the dictionary lists CASCADE on the junctions); catalog
  DELETEs 409 on FK (correct — catalogs must block, users must cascade).
- **Mi perfil email**: the JWT does not carry email (`src/auth.ts` only augments `userId/username/
  display_name/roles/token_version`), so `/profile` must read it server-side via `getUserDetail`. Do
  not source it from the session.
- **Reportes parked at `/admin/reports`** as a placeholder; intentionally not refactored to
  `DataTable` to keep this change focused on Usuarios.
