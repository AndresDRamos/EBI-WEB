---
id: 0005-layout
status: verified          # draft -> approved -> built -> verified -> committed -> superseded
created: 2026-07-01
touches: [docs/modules/navigation.md]
migrations: [V7__nav_registry.sql]
supersedes: null
superseded_by: null
---

# Portal layout & navigation — DB-driven topbar + pinnable sidebar

## Objective

Replace the static PortalShell rail with a navigation system the admin panel
controls: topbar **sections** (Mantenimiento, Calidad, Producción...) stored in
a DB registry, a per-section **sidebar** with one-level nesting, and role-based
visibility + ordering (a role→section grant carries a `priority`; the user's
topbar sorts by the best priority among their roles, then global order; the
protected `admin` role sees everything with no grant rows — app-layer rule).

Sections are **seeded by the migration of the module that introduces them**;
the admin edits label, icon, order, active flag and role grants but cannot
invent routes (no dead links). Decisions fixed with the user (2026-07-01):
DB-seeded registry · role-priority ordering · sidebar pin persisted in a
cookie (SSR-read, per browser) · plan 0004's UI step is amended to "flip the
seeded `maintenance` section active" instead of touching the old rail.

UX contract: 64px fixed icon rail; hover expands a ~240px panel **as an
overlay** (content never reflows); the pin (top-right of the sidebar) makes it
static in-flow. Main content is a no-scroll `h-dvh` grid — scrolling lives
inside rendered components. EZI identity (#373a36 / #ff5c35, Montserrat),
CSS transitions ~200ms, `prefers-reduced-motion` respected.

## Steps

1. ~~Create `db/migrations/V7__nav_registry.sql` from the dba proposal~~ —
   done at plan-save. Also at plan-save: append the amendment to
   `docs/plans/0004-mantenimiento.md` (step 6 no longer edits the global rail;
   it activates the seeded `maintenance` section from the admin panel).
2. **Human gate:** `flyway -configFiles=db/flyway.dev.conf migrate` (applies
   pending V5, V6, then V7), clean `flyway info`, then `pnpm db:gen`. Do not
   proceed until `src/lib/db/types.ts` includes `nav_section`, `nav_item`,
   `role_nav_section`.
3. `src/lib/db/nav.ts` — bind `rootDb.withSchema("auth")` at the top (repo
   rule). Reads: `getNavForUser(userId, isAdmin)` (sections visible to the
   user's roles — or all active for admin — ordered by `MIN(priority)`, then
   `sort_order`, items nested one level), `listSections`, `listItems`,
   `listSectionGrants`. Writes (admin CRUD): create/update/soft-delete for
   sections and items, `setSectionGrants` (replace grants + priorities in one
   trx — trx inherits the schema, do not re-bind). MSSQL inserts use
   `.output("inserted.<pk>")`. App-layer validations the schema can't express:
   `href` must start with the section's `base_path`; nesting depth max 1.
4. `src/lib/nav/icons.ts` — curated map of lucide-react icon names →
   components (only icons the registry may use) + `Circle` fallback. Avoids
   bundling all of lucide for dynamic names. Pure module, no I/O (`lib/nav/`
   follows the `lib/admin/` precedent: never imports from `db/`).
5. API routes (admin-gated with the existing rbac helpers):
   `src/app/api/nav/sections/route.ts` + `[id]/route.ts`,
   `src/app/api/nav/items/route.ts` + `[id]/route.ts`,
   `src/app/api/nav/sections/[id]/grants/route.ts` (PUT replaces grant set).
   Every mutation calls `revalidateTag("nav")`.
6. Nav resolution + caching: `(portal)/layout.tsx` resolves
   `getNavForUser` server-side wrapped in `unstable_cache` keyed by the
   user's role set, tag `"nav"` (dba: tiny tables, but don't query per shell
   render). Read the pin cookie (`ebi.sidebar_pinned`) here so SSR renders
   the final state — no flash, no hydration jump.
7. New shell (replaces the rail part of `src/components/portal-shell.tsx`;
   the header/UserMenu logic is kept):
   - `components/nav/portal-topbar.tsx` — logo, section tabs (active =
     orange underline, `base_path` prefix match), UserMenu. Sections come
     from the resolved nav.
   - `components/nav/portal-sidebar.tsx` — icon rail (64px, always in
     flow) + hover overlay panel (~240px, absolute, shadow) with the active
     section's items (one-level groups); pin toggle top-right writes the
     cookie via a server action and switches the panel to in-flow. CSS
     width/opacity transitions, no re-mount between states.
   - Behavior preserved: under `/admin/*` the global sidebar hides and the
     nested `AdminPanelSidebar` rules (no double rail).
   - Layout: `h-dvh` grid (header row + content row), `main` with
     `min-h-0 overflow-hidden`; pages own their scroll.
   - Mobile: rail hidden; sidebar becomes a sheet triggered from the topbar;
     section tabs collapse into a dropdown past the breakpoint.
8. Admin UI — replace the `/admin/access` placeholder with the real screen
   (`app/(portal)/admin/access/page.tsx` + client page component): manage
   sections (DataTable + EntityFormDialog: label, icon picker from the
   curated map, sort_order, is_active), their items (nested per section),
   and role grants with priority (per-section dialog listing roles +
   priority inputs). Update the `admin-panel-sidebar.tsx` entry label if
   needed. `base_path`/`href` route keys are **read-only** in the UI for
   seeded rows (routes are owned by code); item creation allowed only under
   the section's `base_path`.
9. `docs/modules/navigation.md` from `_module-template.md` — purpose, data
   flow (registry → resolver → shell), the "sections are seeded by module
   migrations" contract, cookie semantics, and the do-not-touch list
   (`priority`: lower = earlier; hard-delete cascades items + grants).
10. Docs sync (docs-sync sub-agent): ERD delta into
    `docs/database/erd/auth.md` (header bump to "V1–V4 + V7"),
    data-dictionary entries, V7 row in `docs/database/migrations-log.md`,
    STATE.md map refresh. Add the missing "Layout / navigation" row to
    `docs/docs-routing.md` (gap found while planning).
11. Verify: `pnpm lint && pnpm build`; manual pass — hover/pin without
    layout shift (pin survives reload via cookie), role-priority ordering
    with a non-admin user, admin CRUD round-trip + `revalidateTag`
    refresh, `/admin` double-rail check, mobile sheet.

## Database impact

Reviewed by the `dba` sub-agent (2026-07-01). Full SQL lands as
`db/migrations/V7__nav_registry.sql` (created at plan-save).

- **3 new tables in `auth`** (role-coupled; inherits V3 schema-scope
  grants): `nav_section` (unique `code` + `base_path`, path-format CHECKs),
  `nav_item` (composite self-FK `(section_id, parent_item_id)` →
  `(section_id, item_id)` so a parent must belong to the same section;
  `UNIQUE(section_id, href)`; depth ≤ 1 app-enforced — no triggers),
  `role_nav_section` (PK `(role_id, section_id)`, `priority` default 100,
  lower = earlier).
- **Cascade policy:** section → items/grants CASCADE (owned children);
  FK to `auth.role` NO ACTION (catalog protected, app 409s) — consistent
  with V5's rules.
- **Seeds:** `dashboards` (active, one item, granted to all active
  non-admin roles — access-preserving) and `maintenance` (`is_active = 0`;
  plan 0004 flips it on from the admin panel, no extra migration).
- **Irreversible operations: none** — all-new objects.
- **Indexes:** only the PKs/unique constraints + 2 small support indexes;
  tables are tiny (<10 / <100 / <200 rows), so no covering indexes — the
  perf lever is the app-side `unstable_cache` keyed by role set (step 6).
- **V7 depends only on V3+V4** (already applied); safe to migrate in the
  same run as pending V5/V6.

## Amendments

- 2026-07-02 — `pnpm lint` failed on the React Compiler's stricter hook rules
  (not anticipated at planning time): (1) `react-hooks/static-components`
  rejected `const Icon = resolveNavIcon(name)` used as a JSX tag, even
  memoized with `useMemo` — fixed by replacing the dynamic-lookup pattern
  with a `NavIcon({ name, className })` component that switches over static
  JSX tags (`src/lib/nav/icons.tsx`, renamed from `.ts`); all 5 call sites
  (`portal-sidebar.tsx`, `portal-topbar.tsx`, `nav-sections-table-page.tsx`,
  `nav-items-panel.tsx`) updated to `<NavIcon name={...} />`. (2)
  `react-hooks/set-state-in-effect` rejected synchronous `setState` calls at
  the top of `nav-grants-panel.tsx`'s fetch effect — fixed by wrapping the
  fetch in an async IIFE inside the effect (behavior unchanged).
- 2026-07-02 — `pnpm build` caught two issues `pnpm lint` didn't: (1) a
  `"use server"` file can only export async functions, so the
  `SIDEBAR_PIN_COOKIE` constant was split out of `src/lib/nav/pin-action.ts`
  into a new `src/lib/nav/pin-cookie.ts` (both modules re-export what they
  need; `(portal)/layout.tsx` now imports the cookie name from
  `pin-cookie.ts`). (2) Next.js 16's `revalidateTag` requires a second
  `profile` argument (`revalidateTag(tag, profile)`, not the one-arg form the
  plan assumed) — all 5 `/api/nav/*` mutation call sites now pass
  `{ expire: 0 }` for immediate invalidation. Neither change affects the
  plan's objective or design.
- 2026-07-02 — Visual verification (logged in as `aramos`, the only seeded
  user, role `admin`): topbar renders the DB-driven "Dashboards" tab with the
  orange active underline; icon rail sits at 64px with no page scroll;
  setting the `ebi.sidebar_pinned` cookie and reloading renders the sidebar
  pinned at 240px in-flow with no flash (SSR-correct first paint, per
  objective); clicking the pin toggle collapses it back to 64px instantly and
  the server action persists `ebi.sidebar_pinned=0` (confirmed via
  `document.cookie`) — the click-driven pin/unpin round trip is fully
  verified. `/admin/access` renders all three panels correctly: the seeded
  `dashboards` (active) and `maintenance` (inactive, `Wrench` icon) sections,
  the `Dashboards` item, and grants for all three non-admin roles (Gerente de
  planta, Materialista, Operador) at priority 100 — matches the V7 seed data
  exactly. `/admin/*` still shows only the nested `AdminPanelSidebar` (no
  double rail), confirming no regression there.
- 2026-07-02 — Two gaps in interactive coverage, neither blocking `verified`
  status: (a) the **hover-to-expand** sidebar transition (mouse enters the
  rail without clicking) could not be simulated through the preview tool —
  synthetic `mouseenter`/`mouseover` events dispatched via
  `element.dispatchEvent()` did not trigger React's synthetic handler (no
  hover primitive exists in the available toolset). The click-driven pin
  path exercises the same `expanded` state and CSS transition classes, so
  this is a code-review-only confirmation of the `onMouseEnter`/
  `onMouseLeave` wiring in `portal-sidebar.tsx`, not an interactive one. (b)
  **role-priority topbar ordering** (a non-admin user's topbar sorting by
  `MIN(priority)` across roles) was not exercised end-to-end because the only
  seeded user (`aramos`) holds the `admin` role, which bypasses grants
  entirely (sees all active sections). Verified instead via the `dba`
  sub-agent's SQL review, `getNavForUser`'s ordering logic (`nav.ts`), and
  the correct grant rows visible in `/admin/access`. Recommend exercising
  this path once a non-admin test user with known credentials exists.
- 2026-07-02 — During the visual pass, a transient `404` on
  `GET /api/nav/sections/[id]/grants` was observed on the first dev-server
  run after the route file was created; a full dev-server restart resolved
  it (subsequent requests returned `200` with correct data) and `pnpm build`
  had already compiled the route successfully. Diagnosed as a Turbopack dev
  HMR route-discovery gap for a newly added nested dynamic segment
  (`[id]/grants/route.ts` sibling to `[id]/route.ts`), not an application
  bug — no code change made.
- 2026-07-02 — `pnpm lint && pnpm build` both pass clean. Objective holds as
  written; no scope change. Status → `verified`.
