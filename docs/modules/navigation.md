# Navigation (portal layout & DB-driven nav registry)

**Last synced:** 2026-07-10 · **Synced from:** plan 0005-layout + 0006 amendment (nav reactivation) + plan portal-home-nav-authz (portal home, page authz, ADR 0005) + plan admin-panel-regroup + unified permission manager redesign (nav structure CRUD + role grants folded into `PermissionManager`'s "Estructura del menú" panel, replacing the Módulos tab entirely) + plan admin-permissions-portal (per-page nav authorization, ADR 0008 supersedes 0005: `auth.role_nav_item` V16, `x-pathname`-driven guard, `/api/org/roles/[id]/items`) + plan 5-cerrar-fronteras (layer-boundaries refactor: `portal-shell.tsx`/`admin-nav.ts` moved into this module, `NavIcon`/`NAV_ICON_NAMES` moved to the shared kit, routes renamed `/api/nav/*` → `/api/navigation/nav/*`) + plan ui-monoliths-decomposition (see the ledger in [docs/plans/README.md](../plans/README.md) for the full plan history)

## Purpose

Resolves and renders the authenticated portal's topbar sections and per-section
sidebar from a DB-backed registry (`auth.nav_section`, `auth.nav_item`,
`auth.role_nav_item`, `auth.role_nav_section`), instead of a hardcoded nav list.
Since V16 (ADR 0008, supersedes 0005) navigation is authorized **per page**:
`auth.role_nav_item` is the source of truth for whether a role can see/reach a
page (`nav_item`), and a **section is derived-visible** ⇔ the role can see ≥1 of
its active pages. `auth.role_nav_section` survives but now carries **only the
per-role order of sections** in the topbar (it no longer grants a section).
`/admin/portal` is a single screen (`/admin/portal/permissions`, org's
`PermissionManager`): its right panel ("Estructura del menú") owns
everything admins used to do from the separate *Módulos* tab — label, icon,
global order and active flag via inline edit dialogs, plus per-role
**page visibility** and intra-section page order via a drag-and-drop tree.
Admins cannot invent routes — sections are seeded by the migration of the
module that introduces them.

## Responsibilities

- Owns the module slice `src/modules/navigation/`: nav data access (`db.ts`),
  nav resolution + ordering (`getNavForUser`, delegating non-admins to the
  page-granular `getGrantedNav`), the cached resolver (`cache.ts`:
  `getCachedNav` / `navRoleKey` + `getCachedNavRegistry` — the role-independent
  registry of active item hrefs + section refs used by the page guard; both
  shared by the shell, the home page and the guard), the per-page route guard
  (`guard.ts`: `requireSectionOrRedirect`), the topbar/sidebar/shell components
  (`components/`: `portal-shell.tsx`, `portal-topbar.tsx`, `portal-sidebar.tsx`
  — since plan 5-cerrar-fronteras `portal-shell.tsx` lives here, not under
  `src/components/layout/`), the sidebar pin cookie (`pin-action.ts` /
  `pin-cookie.ts`) and the admin nav rail builder (`admin-nav.ts`, also moved
  here from `src/components/layout/` by plan 5-cerrar-fronteras). The curated
  icon map (`NavIcon` / `NAV_ICON_NAMES`) is no longer this module's own
  `icons.tsx` — since plan 5-cerrar-fronteras it lives in the shared kit,
  `src/components/kit/nav-icon.tsx` (multiple modules — nav rendering and the
  admin nav-structure editor — need it, so it moved up to `kit`).
  The module no longer has its own admin structure panels — the former
  `nav-sections-table-page.tsx` / `nav-items-panel.tsx` (Módulos tab) and,
  before them, `nav-grants-panel.tsx` were all retired. Structure editing
  (section label/icon/global `sort_order`/active, nav item and child CRUD),
  per-role **page visibility** (`role_nav_item`) and per-role section order
  (`role_nav_section`) now live entirely in
  `src/modules/org/components/nav-access-tree.tsx` (`NavAccessTree`,
  extracted from `permission-manager.tsx` by the ui-monoliths-decomposition
  split — pure UI refactor, no behavior change), rendered as the right panel
  of `permission-manager.tsx`'s orchestrator
  ("Estructura del menú" — a drag-and-drop tree with inline pencil/plus/trash
  dialogs and per-page eye toggles, plus icons in the edit modals), backed by
  this module's data functions:
  - **Structure** (read/write): `listSections`/`listItems` (read),
    `updateSection`, `create/update/deleteItem`, via
    `/api/navigation/nav/sections/[id]` and `/api/navigation/nav/items[/id]`
    (renamed from `/api/nav/*` by plan 5-cerrar-fronteras). Creating a page
    (`POST /api/navigation/nav/items`) also calls `grantItemToSectionRoles`
    so the new page auto-grants to every role that already sees ≥1 page of
    that section (instead of being invisible until re-granted).
  - **Page visibility** (the V16 grant, ADR 0008): `listRoleItemGrants` /
    `setRoleItemGrants` over `auth.role_nav_item`, via
    `GET/PUT /api/org/roles/[id]/items` — role-centric, PUT gated by
    `navigation.grants:update`, 409 for the protected `admin` role, revalidates
    tag `"nav"`. This is what the eye toggles + intra-section page order write.
  - **Section order** (no longer a grant): `listRoleSectionGrants` /
    `setRoleSectionGrants` (+ the per-section `listSectionGrants` /
    `setSectionGrants`) over `auth.role_nav_section`, via
    `GET/PUT /api/org/roles/[id]/sections` (dual of
    `/api/navigation/nav/sections/[id]/grants`) — now only persists the
    per-role topbar section order/priority.
  - **Registry helpers** for the guard: `listActiveItemRefs` /
    `listSectionRefs` feed `getCachedNavRegistry`.

  `src/modules/navigation/components/portal-shell.tsx` (global chrome,
  moved here from `src/components/layout/` by plan 5-cerrar-fronteras)
  composes the topbar/sidebar pieces — the layer allowed to import from this
  module for rendering; `modules/org` imports this module's `db.ts`
  functions and types directly for the permission manager's tree.
- **Owns page authorization** (plan admin-permissions-portal, ADR 0008,
  supersedes 0005): `requireSectionOrRedirect(code)` now enforces at **page**
  granularity — a route is reachable only if the page owning it resolves
  visible for the user (*what is shown = what is reachable*, per page). A
  section still gates its whole subtree (a hidden section hides all its pages),
  and a section is derived-visible when ≥1 of its pages is. Resolution: it
  first checks the section is in the user's `getCachedNav` tree, then does a
  longest-prefix match of the current path against `getCachedNavRegistry`'s
  active item hrefs — if the path maps to a **registered** page the role can't
  see, redirect `/`; if it maps to no registered item (e.g. a detail route), it
  inherits the section's visibility and is allowed. The current path arrives via
  the **`x-pathname` request header injected by `src/middleware.ts`** (Next.js
  doesn't hand the pathname to server layouts). Each module wires the guard in
  its own `(portal)/<module>/layout.tsx` (e.g. `maintenance/layout.tsx`),
  redirecting denied users to `/`. Authentication itself stays in
  `src/middleware.ts` (default-deny, no per-prefix allowlist); `/admin/*` keeps
  `assertAdminOrRedirect` (a role gate, not a nav grant).
- The admin panel reuses this module's `PortalSidebar`, fed the code-built
  `ADMIN_NAV_SECTION` (`src/modules/navigation/admin-nav.ts`, moved here from
  `src/components/layout/` by plan 5-cerrar-fronteras) — no bespoke admin
  rail. `PortalShell` renders `PortalSidebar` for both the portal and `/admin/*`.
  Since plan admin-panel-regroup the section has **two grouped entries** —
  Organización (`/admin/organization`: Usuarios · Departamentos y roles ·
  Plantas, still tabbed with the kit `PageTabs`) and Portal (`/admin/portal`).
  Portal is **no longer tabbed**: `/admin/portal/layout.tsx` renders a single
  header over `{children}`, and `/admin/portal/page.tsx` redirects straight to
  `/admin/portal/permissions` — the `modules`/`permissions` two-tab split (and
  the `/admin/portal/modules` route/folder) is gone. The old flat `/admin/*`
  routes remain `redirect()`-only legacy pages (`/admin` →
  `/admin/organization/users`).

## Dependency flow

```
module migration (Vn) → seeds auth.nav_section (+ auth.nav_item)
      │
      ▼
auth.role_nav_item     (page visibility + intra-section order — the grant, ADR 0008)
auth.role_nav_section  (per-role section ORDER only, no longer a grant)
      │  (PermissionManager "Estructura del menú": label/icon/order/active + page eye toggles)
      ▼
getNavForUser(roleNames, isAdmin) → getGrantedNav  — src/modules/navigation/db.ts
      │  pages from role_nav_item (best per-role priority, then nav_item.sort_order);
      │  section shown iff ≥1 visible page, ordered by best role_nav_section.priority
      ▼
getCachedNav + getCachedNavRegistry (cache.ts — unstable_cache, tags:["nav"])
      │      ↑ shell / home / guard          ↑ guard only (path → registered page?)
      │  (portal)/layout.tsx also reads the pin cookie;
      │  the guard also reads the x-pathname header (from middleware)
      ▼
PortalShell → PortalTopbar (sections) + PortalSidebar (active section's items)
```

Every `/api/navigation/nav/*` mutation — and `PUT /api/org/roles/[id]/items`
+ `PUT /api/org/roles/[id]/sections` — calls `revalidateTag("nav")` so the
next shell render (and the next guard resolution) picks up the change
without a manual cache-bust.

## Related ADRs

- [ADR 0008](../architecture/adr/0008-page-grants-authorize-pages.md) —
  **page** grants authorize pages (`auth.role_nav_item`; the page-granular
  `requireSectionOrRedirect` guard). Current authority.
- [ADR 0005](../architecture/adr/0005-section-grants-authorize-pages.md) —
  section grants authorize pages. **Superseded by 0008**; kept for history.

The original design decisions (DB-seeded registry, role-priority ordering,
cookie-persisted pin) were recorded in plan 0005 (pruned; row in the
[plans ledger](../plans/README.md), full text in git history), not split
into an ADR. This module doc carries the live truth.

## Do not touch without reading

- **`base_path` / `href` are route keys owned by code.** The admin UI never
  lets you set them freely: sections have no "create" action (only edit), and
  item `href` is validated server-side to start with the section's
  `base_path`. Don't add a section-creation form without re-reading why this
  was deliberately left out (plan 0005, "cannot invent routes").
- **Two `priority` axes, both "lower = earlier", neither global.** Since V16:
  `role_nav_item.priority` orders a role's **pages within a section** (a page's
  final position = `MIN(priority)` across the user's roles, then
  `nav_item.sort_order`); `role_nav_section.priority` orders **sections in the
  topbar** for the role (`MIN(priority)` across roles, then
  `nav_section.sort_order`). `role_nav_section` no longer *grants* the section —
  it is derived-visible from `role_nav_item` (≥1 visible active page). Don't
  read a `role_nav_section` row as "the role can see this section".
- **The `admin` role never gets grant rows** (`role_nav_item` nor
  `role_nav_section`). It sees EVERY section and page — including inactive
  sections — by an app-layer rule in `getNavForUser` (same pattern as the
  protected-role guard in `modules/org/db/org.ts`). The redesigned tree dims by
  *grant* (opacity / eye-toggle off when the current `roleId` lacks the page),
  not by `is_active`. Non-admins never receive inactive sections/items
  regardless; the page-granular `requireSectionOrRedirect` (ADR 0008) reuses
  that same resolution for authorization — keep it intact. Adding an explicit
  grant row for `admin` is a no-op — don't "fix" a missing admin grant, it's
  intentional (the API 409s on it).
- **Reactivation is now form state, not a row action.** The redesign's
  `SectionEditDialog` (its own file, `section-edit-dialog.tsx`, since the
  ui-monoliths-decomposition split of `permission-manager.tsx`; also exports
  the shared `IconPickerField` used by `item-edit-dialog.tsx`) puts
  `is_active` back as a plain checkbox in the edit form (PUT
  `/api/navigation/nav/sections/[id]`) — this
  supersedes the 0006-era `onRestore`/`DataTable` pattern, which no longer
  applies now that the Módulos tab's table pages are gone. `ItemEditDialog`
  only shows the `is_active` checkbox when editing an existing item (not on
  create).
- **Hard-deleting a `nav_section` cascades its items and section-order rows**
  (V7 FK); deleting a `nav_item` cascades its `role_nav_item` grants (V16 FK
  `ON DELETE CASCADE`). If a module's section/page disappears from the admin
  screen unexpectedly, check for a hard delete before assuming a migration
  didn't run.
- **The sidebar pin cookie (`ebi.sidebar_pinned`) is per-browser, not per
  user.** It's read once in `(portal)/layout.tsx` for the SSR-correct first
  paint; `PortalSidebar` owns the hover/pin state after hydration.
