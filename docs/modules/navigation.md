# Navigation (portal layout & DB-driven nav registry)

**Last synced:** 2026-07-02 · **Synced from:** plan 0005-layout

## Purpose

Resolves and renders the authenticated portal's topbar sections and per-section
sidebar from a DB-backed registry (`auth.nav_section`, `auth.nav_item`,
`auth.role_nav_section`), instead of a hardcoded nav list. Admins control
label, icon, order, active flag, and role-based visibility/priority from
`/admin/access`; they cannot invent routes — sections are seeded by the
migration of the module that introduces them.

## Responsibilities

- Owns: nav data access (`src/lib/db/nav.ts`), nav resolution + ordering
  (`getNavForUser`), the shell components (`src/components/nav/*`,
  `src/components/portal-shell.tsx`), the sidebar pin cookie
  (`src/lib/nav/pin-action.ts`), the curated icon map
  (`src/lib/nav/icons.ts`), and the admin screen at `/admin/access`.
- Does **not** own: route protection (that's `src/middleware.ts` +
  `assertAdminOrRedirect`/`requireAnyRole` — the nav registry only decides
  what's *shown*, not what's *reachable*; a user can still hit an unlisted
  URL directly if RBAC allows it) or the admin panel's own nested sidebar
  (`components/admin/admin-panel-sidebar.tsx`, unrelated — `/admin/*` hides
  the global rail entirely).

## Dependency flow

```
module migration (Vn) → seeds auth.nav_section (+ auth.nav_item)
      │
      ▼
auth.role_nav_section  (admin panel: label/icon/order/active + grants)
      │
      ▼
getNavForUser(roleNames, isAdmin)  — src/lib/db/nav.ts
      │  ordered by MIN(priority) across the user's roles, then sort_order
      ▼
(portal)/layout.tsx — unstable_cache(tags:["nav"]), reads the pin cookie
      │
      ▼
PortalShell → PortalTopbar (sections) + PortalSidebar (active section's items)
```

Every `/api/nav/*` mutation calls `revalidateTag("nav")` so the next shell
render picks up the change without a manual cache-bust.

## Related ADRs

None yet — the design decisions (DB-seeded registry, role-priority ordering,
cookie-persisted pin) are recorded in
[docs/plans/0005-layout.md](../plans/0005-layout.md), not split into an ADR.

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
- **The `admin` role never gets grant rows.** It sees every active section by
  an app-layer rule in `getNavForUser` (same pattern as the protected-role
  guard in `org.ts`). Adding an explicit grant row for `admin` is a no-op —
  don't "fix" a missing admin grant, it's intentional.
- **Hard-deleting a `nav_section` cascades its items and grants** (V7 FK). If
  a module's section disappears from the admin screen unexpectedly, check for
  a hard delete before assuming a migration didn't run.
- **The sidebar pin cookie (`ebi.sidebar_pinned`) is per-browser, not per
  user.** It's read once in `(portal)/layout.tsx` for the SSR-correct first
  paint; `PortalSidebar` owns the hover/pin state after hydration.
