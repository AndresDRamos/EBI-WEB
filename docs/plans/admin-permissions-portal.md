---
id: admin-permissions-portal
status: committed
created: 2026-07-08
touches: [navigation, org]
migrations: [V16]
supersedes: null
superseded_by: null
---

# Admin permissions portal — page-granular nav authz + unified filter

## Objective

Rework `/admin/portal/permissions` so nav authorization is **per page** (not
per section) and the whole screen is driven by **one filter line**. Concretely:

1. **One filter line** at the top drives both panels (permission matrix + nav
   tree). Default mode asks for a **Rol**; a toggle switches to a specific
   **Usuario** (whose roles then appear as chips → editing acts on the chosen
   role). The right panel loses its own "Ver como" select.
2. **Per-role page ordering**: pages (nav items + sub-items) can be dragged to
   reorder *for the selected role*, persisted in `role_nav_item.priority`
   (section order was already per-role via `role_nav_section.priority`).
3. **Icon rendered** in the page/section edit modal, next to the icon selector,
   so the admin sees which icon they're assigning.
4. **Ungranted sections sink to the end** of the tree, always.
5. **Page-granular visibility**: `role_nav_item` is the source of truth for
   "can this role see/reach this page". A **section is derived**: visible ⇔ the
   role sees ≥1 active page in it (no visible pages → no section). Enforcement
   drops to page level: a non-visible registered page is not reachable by URL
   (redirect to `/`), preserving ADR "shown = reachable".
6. **Scoped scrollbars**: each panel has a bounded height so its body scrolls
   internally (header filter + footer fixed); modules in the matrix start
   **collapsed** by default.

## Steps

1. **V16** (from the `dba` sub-agent — see Database impact): create
   `auth.role_nav_item`, backfill from `role_nav_section`. Apply to `EBI_dev`
   (`flyway migrate` + clean `info`), `pnpm db:gen`.
2. **Data pre-check** (MCP `ebi-sql-dev`, read-only): confirm no
   `role_nav_section` points at a section with zero active `nav_item`s (those
   roles would lose the section after backfill). Report if any.
3. **`modules/navigation/db.ts`**: `getNavForUser` filters items by
   `role_nav_item` for the user's roles, orders items by the best (lowest)
   per-role `priority`, and only returns sections with ≥1 visible item.
   `role_nav_section` read/write narrows to section **order** only. Add
   role-centric reads/writes: `listRoleItemGrants(roleId)`,
   `setRoleItemGrants(roleId, grants)` (replace-in-transaction, mirrors
   `setRoleSectionGrants`).
4. **`middleware.ts` + `navigation/guard.ts`**: middleware injects an
   `x-pathname` header; the guard resolves the current path against the cached
   nav. Rule: if the path matches a **registered** `nav_item.href` (exact or
   nested) that is not visible for the role → redirect `/`. Paths under a
   section `base_path` not matching any registered item inherit the nearest
   visible ancestor item / the section's visibility. `admin` bypasses. Module
   segment layouts keep a one-line guard call (now page-aware).
5. **API**: new `src/app/api/roles/[id]/items/route.ts` (GET → grants+priority
   for the role; PUT → replace set). Both invalidate the `nav` cache tag.
   `/api/roles/[id]/sections` PUT keeps only section order (priority); its GET
   still feeds the section order. `/api/nav/items/[id]` PUT no longer needed
   for per-role order (global `sort_order` stays for defaults/new items).
6. **`org/components/permission-manager.tsx`**:
   - Lift a single **filter bar** (mode Rol⇄Usuario) above both panels; both
     panels consume the shared `roleId`. Remove the right panel's "Ver como".
   - Left matrix: toggle acts per **page** is not here (matrix = actions); keep
     as is, but **modules collapsed by default** and body scrolls internally.
   - Right tree: visibility toggle is per **page** (`role_nav_item`); a section
     with 0 visible pages auto-dims and **sorts to the end**; drag persists
     per-role page `priority`. Render the **icon** in `ItemEditDialog` /
     `SectionEditDialog` next to the selector.
   - **Bounded panel heights** (`h`/`max-h` + `min-h-0`) so each panel scrolls
     internally instead of extending the page.
7. **New-page default**: when an admin adds a page to a section, auto-grant it
   (in `role_nav_item`) to every role that already sees that section (has ≥1
   visible page there), so "added a page and nobody sees it" doesn't happen.
8. **ADR**: new `0008-page-grants-authorize-pages.md` supersedes `0005`; mark
   `0005` `Status: Superseded by 0008`. Run `docs-sync` (ERD `auth`,
   `docs/modules/navigation.md`, `navigation.grants:update` description).
9. **Verify**: `pnpm lint && pnpm build`; visual pass (Rol + Usuario modes,
   drag reorder, per-page toggle, section auto-sink, scoped scroll, guard via
   direct URL).

## Database impact

From the `dba` sub-agent (V16, free version on origin/main):

- **New `auth.role_nav_item (role_id, item_id, priority)`**, PK
  `(role_id, item_id)`; FK `role` = NO ACTION (protect catalog, app 409s),
  FK `nav_item` = ON DELETE CASCADE (house pattern per V7); `priority` NOT NULL
  DEFAULT 100; secondary index `IX_role_nav_item_item (item_id)` for the
  reverse view + the nav_item delete cascade.
- **Backfill**: `INSERT ... SELECT` from `role_nav_section ⋈ nav_item` (active
  items, all nesting levels), `priority = nav_item.sort_order`. Idempotent
  (`NOT EXISTS`). `admin` holds no grants → gets none.
- `auth.role_nav_section` **kept**, structurally unchanged; semantics narrow to
  "section order in the topbar per role" (no longer grants the section).
- **Irreversible at DB level: none** (additive + data backfill; `DROP TABLE`
  restores prior state). The irreversible part is the **coupled app cutover**:
  `role_nav_section` rows change meaning, so migration + app deploy together.
- Supersedes **ADR 0005** → new ADR 0008 (page = unit of authorization);
  segment guard moves to per-page resolution (step 4).

## Amendments

- 2026-07-08 — **`deleteRole` regression caught by `docs-sync` and fixed.**
  `role_nav_item`'s FK to `auth.role` is NO ACTION (house pattern), so
  `deleteRole` (`modules/org/db/org.ts`) had to clear `role_nav_item` in its
  transaction too, or deleting a non-admin role with page grants would 409 on
  the FK. Added the delete + updated the doc bullet in `docs/modules/rbac.md`.
  Objective unaffected.
- 2026-07-08 — **`docs/modules/rbac.md` was outside the plan's `touches` but
  documents the reworked right panel.** Updated it to the page-granular model
  (unified filter bar, per-page eye toggle, `role_nav_item` order,
  `/api/roles/[id]/items`, ADR 0008) as part of this plan.
- 2026-07-08 — **Verification evidence.** `flyway info` clean at V16 (Success);
  `pnpm db:gen` → 37 tables (incl. `RoleNavItem`); backfill pre-check via
  `ebi-sql-dev`: 0 orphan section grants; resolver query for role "Coordinador
  de mantenimiento" returns the expected single visible page
  (`/maintenance/machines`); `pnpm lint` clean; `pnpm build` compiled
  successfully; dev server boots with no errors; unauthenticated
  `/admin/portal/permissions` → 307 `/login`, `/api/roles/12/items` → 401.
  **Not drive-tested:** the authenticated drag/toggle UI — reading `.env`
  (test creds) was permission-denied this session, so no browser login. Core
  logic verified via the resolver query + the endpoint/guard behavior above;
  a manual UI pass is the one remaining check.
