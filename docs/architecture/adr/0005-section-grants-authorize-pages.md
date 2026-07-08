# ADR 0005 — Section grants authorize pages

- **Status:** Superseded by [ADR 0008](0008-page-grants-authorize-pages.md) — 2026-07-08
  (original: Accepted 2026-07-03)
- **Context plan:** [Portal home & nav authz](../../plans/portal-home-nav-authz.md)

> **Superseded.** The unit of navigation authorization moved from the *section*
> to the individual *page* (`nav_item`, V16 `role_nav_item`): a section is now
> *derived*-visible (≥1 visible page). The `requireSectionOrRedirect` guard
> still exists and still gates the whole section, but additionally enforces
> per-page visibility. See ADR 0008 for the current decision; the text below is
> kept for historical context.

## Context

The DB nav registry (plan 0005: `auth.nav_section`, `nav_item`, `role_nav_section`)
decided what the topbar and sidebar *show* per user, but not what they can *reach*.
`getNavForUser` filtered the rail by role grants, yet nothing stopped an authenticated
user from typing `/maintenance/machines` directly — the middleware only checked
authentication, and its per-prefix `isPortal` allowlist (`/dashboards`||`/admin`) had
already gone stale and didn't even list `/maintenance`. So a "granted-only" section was
visually hidden but functionally public to any logged-in user.

Plan 0006 added action-level permissions (`requirePermission`, ADR 0004) — but those
gate *mutations* (a button, an endpoint), not *page reachability*. There was no owner
for "can this user open this page at all?" This is the last broken link in the
module→portal lifecycle: a new module seeds its section, the admin grants it, but the
grant carried no teeth.

## Decision

- **`nav_section.code` is the unit of page authorization.** A user may reach a route
  under a section's `base_path` only if that section resolves *visible* for them — the
  exact same resolution as the rail (`getCachedNav` → `getNavForUser`). What is shown
  equals what is reachable.
- **Enforcement lives in each module's segment layout**, not in the middleware. Next.js
  layouts don't receive the pathname on the server, so a generic `(portal)` guard can't
  branch per section; instead every module adds a one-line
  `(portal)/<module>/layout.tsx` calling `requireSectionOrRedirect("<code>")`
  (`src/modules/navigation/guard.ts`). This mirrors the existing admin pattern
  (`assertAdminOrRedirect` in `(portal)/admin/layout.tsx`) and becomes part of the
  module blueprint recipe (§5).
- **The guard reuses the cached nav resolution**, so it inherits every visibility rule
  for free: the protected `admin` profile bypasses (sees all sections, active or not),
  inactive/dark-launched sections are unreachable for everyone else, and results come
  from the `"nav"`-tagged cache (invalidated by `/api/nav/*` mutations).
- **Denied users are redirected to `/` (home)**, not shown a 403: for them the section
  simply doesn't exist. `/` and `/profile` are outside the registry — authentication
  only. `/admin/*` keeps its own `assertAdminOrRedirect` (admin is a role gate, not a
  section grant; the admin sidebar is code-built, not a `nav_section`).
- **The middleware becomes default-deny for authentication.** The stale `isPortal`
  allowlist is removed: every non-public route requires a session (the matcher already
  excludes static assets), so new modules are authenticated without editing the
  middleware. Per-section authorization is layered on top, in the segment layouts.

## Consequences

- Page authorization and rail visibility can never disagree — they call the same
  resolver. A section made inactive or ungranted disappears *and* becomes unreachable in
  one move.
- Adding a module now costs one extra file (the segment-layout guard); forgetting it
  leaves the pages reachable by any authenticated user (fails open to *authenticated*,
  not to anonymous — the middleware still requires a session). The blueprint lists the
  guard as a required step to make the omission visible in review.
- The guard runs a cached read per protected page render; at nav-registry scale
  (<10 sections) this is negligible and shared with the shell's own resolution.
- This is orthogonal to ADR 0004: section grants authorize *pages*, permission grants
  authorize *actions*. A user can reach `/maintenance/machines` (section grant) yet not
  see the "Nuevo equipo" button (missing `maintenance.asset:create`). Both hang off the
  access profile (`auth.role`); `admin` bypasses both.
