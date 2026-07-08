# ADR 0008 — Page grants authorize pages

- **Status:** Accepted — 2026-07-08
- **Supersedes:** [ADR 0005](0005-section-grants-authorize-pages.md)
- **Context plan:** [Admin permissions portal](../../plans/admin-permissions-portal.md)

## Context

ADR 0005 made `nav_section.code` the unit of page authorization: a role was
granted a whole section (`role_nav_section`), and every route under its
`base_path` became reachable in one move — "what is shown = what is reachable",
at section granularity. In practice a section bundles several pages
(`nav_item`s: e.g. maintenance's `Máquinas` and `Procesos`), and the admin
needs finer control: let a role see *some* pages of a section but not others,
and order those pages per role. Section-level grants can't express that.

The catalog already models pages as `nav_item` rows under a section; only the
authorization axis was missing a per-page grant. Section order was already
per-role (`role_nav_section.priority`); page order was global
(`nav_item.sort_order`), shared by every role.

## Decision

- **`nav_item` is the unit of page authorization.** V16 adds
  `auth.role_nav_item (role_id, item_id, priority)`: the source of truth for
  "can this role see/reach this page", and `priority` orders pages **within
  their section, per role**. A user sees an active page only if one of their
  roles grants it.
- **A section is derived, not granted.** A section resolves *visible* for a role
  iff the role sees ≥1 active page in it. There is no "empty granted section":
  no visible pages → no section. `role_nav_section` is **kept but narrowed** to
  carry only the per-role *section order* (topbar priority); it no longer grants
  the section.
- **Enforcement drops to page granularity.** `requireSectionOrRedirect(code)`
  (each module's `(portal)/<module>/layout.tsx`) still gates the section (a
  hidden section hides its whole subtree), and *additionally*: if the current
  path matches a registered active `nav_item.href` (exact or nested) that the
  role can't see, it redirects to `/`. Paths that match no registered item
  (e.g. a detail route with no nav entry) inherit their section's visibility.
  The guard resolves the current path from an `x-pathname` request header
  injected by the middleware (Next.js layouts don't receive the pathname on the
  server). Resolution reuses the `"nav"`-tagged cache (`getCachedNav` +
  `getCachedNavRegistry`).
- **The `admin` role bypasses**, exactly as before: it holds no grant rows,
  sees and reaches every section and page.
- **New pages inherit the section's audience.** When an admin adds a page to a
  section, it is auto-granted (`role_nav_item`) to every role that already sees
  that section, so a newly created page appears where the section already does
  instead of being invisible until re-granted.

## Consequences

- Page visibility and reachability can never disagree — the sidebar renders the
  role's visible pages and the guard blocks the rest, both from the same
  resolver. A hidden page is gone from the sidebar *and* returns `/` on direct
  URL.
- Backfill (V16) preserves prior access: each existing `role_nav_section` grant
  fanned out to every active page of its section, so no role lost access at
  cutover. The migration is additive/reversible at the DB level; the
  irreversible part is the coupled app cutover (`role_nav_section` rows change
  meaning), so migration + app deploy ship together.
- The `navigation.grants:update` permission now authorizes editing *page*
  visibility (and section order), not section grants; its code is unchanged.
- Cost: the non-admin nav resolver joins one extra table
  (`role_nav_item ⋈ nav_item ⋈ nav_section`) and the guard does one cached
  registry read per protected render. At nav-registry scale (<10 sections,
  <100 pages) this is negligible and shared with the shell's own resolution.
- This stays orthogonal to ADR 0004: page grants authorize *pages*, permission
  grants authorize *actions*. A role can see `/maintenance/machines` (page
  grant) yet not the "Nuevo equipo" button (missing `maintenance.asset:create`).
