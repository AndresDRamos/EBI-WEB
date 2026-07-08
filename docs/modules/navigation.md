# Navigation (portal layout & DB-driven nav registry)

**Last synced:** 2026-07-07 · **Synced from:** plan 0005-layout + 0006 amendment (nav reactivation) + plan portal-home-nav-authz (portal home, page authz, ADR 0005) + plan admin-panel-regroup + unified permission manager redesign (nav structure CRUD + role grants folded into `PermissionManager`'s "Estructura del menú" panel, replacing the Módulos tab entirely)

## Purpose

Resolves and renders the authenticated portal's topbar sections and per-section
sidebar from a DB-backed registry (`auth.nav_section`, `auth.nav_item`,
`auth.role_nav_section`), instead of a hardcoded nav list. `/admin/portal`
is now a single screen (`/admin/portal/permissions`, org's
`PermissionManager`): its right panel ("Estructura del menú") owns
everything admins used to do from the separate *Módulos* tab — label, icon,
global order and active flag via inline edit dialogs, plus per-role
section visibility and topbar priority via a drag-and-drop tree. Admins
cannot invent routes — sections are seeded by the migration of the module
that introduces them.

## Responsibilities

- Owns the module slice `src/modules/navigation/`: nav data access (`db.ts`),
  nav resolution + ordering (`getNavForUser`), the cached resolver (`cache.ts`:
  `getCachedNav` / `navRoleKey`, shared by the shell, the home page and the
  guard), the per-section page guard (`guard.ts`:
  `requireSectionOrRedirect`), the topbar/sidebar components (`components/`:
  `portal-topbar.tsx`, `portal-sidebar.tsx`), the sidebar pin cookie
  (`pin-action.ts` / `pin-cookie.ts`) and the curated icon map (`icons.tsx`).
  The module no longer has its own admin structure panels — the former
  `nav-sections-table-page.tsx` / `nav-items-panel.tsx` (Módulos tab) and,
  before them, `nav-grants-panel.tsx` were all retired. Structure editing
  (section label/icon/global `sort_order`/active, nav item and child CRUD)
  and role → section grants + per-role topbar priority now live entirely in
  `src/modules/org/components/permission-manager.tsx`'s right panel
  ("Estructura del menú" — a drag-and-drop tree with inline pencil/plus/trash
  dialogs), backed by this module's data functions: `listSections`/`listItems`
  (read), `updateSection`, `create/update/deleteItem` (structure, via
  `/api/nav/sections/[id]` and `/api/nav/items[/id]`), and
  `listRoleSectionGrants` / `setRoleSectionGrants` (grants, via
  `GET/PUT /api/roles/[id]/sections` — the role-centric dual of
  `/api/nav/sections/[id]/grants` over the same `auth.role_nav_section`
  table: PUT gated by `navigation.grants:update`, 409 for the protected
  `admin` role, revalidates tag `"nav"`). `src/components/layout/portal-shell.tsx`
  (global chrome) composes the topbar/sidebar pieces — the layer allowed to
  import from this module for rendering; `modules/org` imports this module's
  `db.ts` functions and types directly for the permission manager's tree.
- **Owns page authorization by section** (plan portal-home-nav-authz, ADR 0005):
  `requireSectionOrRedirect(code)` lets a route be reached only if its section
  resolves visible for the user — *what is shown = what is reachable*. Each
  module wires it in its own `(portal)/<module>/layout.tsx` (e.g.
  `maintenance/layout.tsx`), redirecting denied users to `/`. Authentication
  itself stays in `src/middleware.ts` (now default-deny, no per-prefix
  allowlist); `/admin/*` keeps `assertAdminOrRedirect` (a role gate, not a
  section grant).
- The admin panel reuses this module's `PortalSidebar`, fed the code-built
  `ADMIN_NAV_SECTION` (`src/components/layout/admin-nav.ts`) — no bespoke admin
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
auth.role_nav_section  (PermissionManager "Estructura del menú": label/icon/order/active + grants)
      │
      ▼
getNavForUser(roleNames, isAdmin)  — src/modules/navigation/db.ts
      │  ordered by MIN(priority) across the user's roles, then sort_order
      ▼
getCachedNav (cache.ts — unstable_cache, tags:["nav"]) ← layout / home / guard
      │  (portal)/layout.tsx also reads the pin cookie
      │
      ▼
PortalShell → PortalTopbar (sections) + PortalSidebar (active section's items)
```

Every `/api/nav/*` mutation — and `PUT /api/roles/[id]/sections` — calls
`revalidateTag("nav")` so the next shell render picks up the change without
a manual cache-bust.

## Related ADRs

- [ADR 0005](../architecture/adr/0005-section-grants-authorize-pages.md) —
  section grants authorize pages (the `requireSectionOrRedirect` guard).

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
- **`priority`: lower number = earlier in the user's topbar.** It's a
  role→section grant field, not a global setting — a section's final position
  is `MIN(priority)` across all the user's granted roles, then
  `nav_section.sort_order` as the tiebreaker.
- **The `admin` role never gets grant rows.** It sees EVERY section —
  including inactive ones — by an app-layer rule in `getNavForUser` (same
  pattern as the protected-role guard in `modules/org/db/org.ts`). The old
  Módulos-tab `DataTable` rendered inactive rows dimmed with an "oculta"
  badge and a restore action; the redesigned tree doesn't visually
  distinguish `is_active` sections from active ones in the same way — it
  dims by *grant* (opacity when the current `roleId` lacks access), not by
  `is_active`. Non-admins never receive inactive sections regardless;
  `requireSectionOrRedirect` (plan portal-home-nav-authz) reuses that rule
  for page authorization — keep it intact. Adding an explicit grant row for
  `admin` is a no-op — don't "fix" a missing admin grant, it's intentional.
- **Reactivation is now form state, not a row action.** The redesign's
  `SectionEditDialog` (in `permission-manager.tsx`) puts `is_active` back as
  a plain checkbox in the edit form (PUT `/api/nav/sections/[id]`) — this
  supersedes the 0006-era `onRestore`/`DataTable` pattern, which no longer
  applies now that the Módulos tab's table pages are gone. `ItemEditDialog`
  only shows the `is_active` checkbox when editing an existing item (not on
  create).
- **Hard-deleting a `nav_section` cascades its items and grants** (V7 FK). If
  a module's section disappears from the admin screen unexpectedly, check for
  a hard delete before assuming a migration didn't run.
- **The sidebar pin cookie (`ebi.sidebar_pinned`) is per-browser, not per
  user.** It's read once in `(portal)/layout.tsx` for the SSR-correct first
  paint; `PortalSidebar` owns the hover/pin state after hydration.
