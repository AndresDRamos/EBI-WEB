# Navigation (portal layout & DB-driven nav registry)

**Last synced:** 2026-07-03 · **Synced from:** plan 0005-layout + 0006 amendment (nav reactivation) + plan portal-home-nav-authz (portal home, page authz, ADR 0005) + plan admin-panel-regroup (admin routes regrouped)

## Purpose

Resolves and renders the authenticated portal's topbar sections and per-section
sidebar from a DB-backed registry (`auth.nav_section`, `auth.nav_item`,
`auth.role_nav_section`), instead of a hardcoded nav list. Admins control
label, icon, order, active flag, and role-based visibility/priority from
`/admin/portal/modules` (the *Módulos* tab; legacy `/admin/access` redirects
there); they cannot invent routes — sections are seeded by the migration of
the module that introduces them.

## Responsibilities

- Owns the module slice `src/modules/navigation/`: nav data access (`db.ts`),
  nav resolution + ordering (`getNavForUser`), the cached resolver (`cache.ts`:
  `getCachedNav` / `navRoleKey`, shared by the shell, the home page and the
  guard), the per-section page guard (`guard.ts`:
  `requireSectionOrRedirect`), the topbar/sidebar components and the nav
  registry admin panels (`components/`: `nav-sections-table-page`,
  `nav-items-panel`, `nav-grants-panel`, composed by the *Módulos* tab at
  `/admin/portal/modules`), the sidebar pin cookie
  (`pin-action.ts` / `pin-cookie.ts`) and the curated icon map (`icons.tsx`).
  `src/components/layout/portal-shell.tsx` (global chrome) composes these
  pieces — the layer allowed to import from this module.
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
  Plantas) and Portal (`/admin/portal`: Módulos · Permisos); each group's tabs
  are real routes rendered by the kit `PageTabs` in its layout, and the old
  flat `/admin/*` routes are `redirect()`-only legacy pages
  (`/admin` → `/admin/organization/users`).

## Dependency flow

```
module migration (Vn) → seeds auth.nav_section (+ auth.nav_item)
      │
      ▼
auth.role_nav_section  (admin panel: label/icon/order/active + grants)
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

Every `/api/nav/*` mutation calls `revalidateTag("nav")` so the next shell
render picks up the change without a manual cache-bust.

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
  including inactive ones, rendered dimmed with an "oculta" badge in the
  topbar (0006 amendment: the admin never loses the portal map and can
  reactivate from `/admin/portal/modules`) — by an app-layer rule in `getNavForUser`
  (same pattern as the protected-role guard in `modules/org/db/org.ts`).
  Non-admins never receive inactive sections; `requireSectionOrRedirect`
  (plan portal-home-nav-authz) reuses that rule for page authorization — keep it intact. Adding an explicit grant row for
  `admin` is a no-op — don't "fix" a missing admin grant, it's intentional.
- **Reactivation goes through the kit's `onRestore`** (`DataTable` prop,
  0006 amendment): sections and items PUT `{ is_active: true }` from
  `/admin/portal/modules`. Don't re-add an `is_active` field to the edit dialogs —
  the active flag is a row action, not form state.
- **Hard-deleting a `nav_section` cascades its items and grants** (V7 FK). If
  a module's section disappears from the admin screen unexpectedly, check for
  a hard delete before assuming a migration didn't run.
- **The sidebar pin cookie (`ebi.sidebar_pinned`) is per-browser, not per
  user.** It's read once in `(portal)/layout.tsx` for the SSR-correct first
  paint; `PortalSidebar` owns the hover/pin state after hydration.
