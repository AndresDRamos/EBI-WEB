---
id: admin-panel-regroup
status: committed
created: 2026-07-03
touches:
  - docs/modules/navigation.md
  - docs/modules/rbac.md
migrations: []
supersedes: null
superseded_by: null
---

# Admin panel regroup — two tabbed groups, roles inside departments, permission matrix

## Objective

Regroup the admin panel from 6 flat pages into 2 groups with tabs as real routes —
**Organización** (Usuarios · Departamentos y roles · Plantas) and **Portal**
(Módulos · Permisos) — introducing two reusable kit components (`PageTabs`,
`GroupedDataTable`), merging roles into the departments view, and reworking the
permission panel as a resource × action matrix. No data-model, API or guard
changes (ADR 0005 intact). The module-access tree with department/role grants is
phase 2 (separate plan).

## Steps

1. **Kit `PageTabs`** (`src/components/kit/page-tabs.tsx`): route-aware tab bar
   (hrefs + labels, active via `usePathname`), pure UI — kit never imports
   modules.
2. **Kit `GroupedDataTable`** (`src/components/kit/grouped-data-table.tsx`):
   collapsible parent groups with their own CRUD (edit/deactivate/delete/restore
   + child count) and child rows with their own CRUD + per-group "add child"
   button; Activos/Inactivos toggle like `DataTable`; no pagination (catalogs of
   dozens). Reuses `entity-form-dialog` and the `ActionsCell` patterns.
3. **New grouped routes** under `(portal)/admin/`:
   - `organization/layout.tsx` (header "Organización" + `PageTabs`) with
     `users/`, `departments/`, `plants/` — current server pages move as-is
     (users, plants) or point to the merged component (departments).
   - `portal/layout.tsx` (header "Portal" + `PageTabs`) with `modules/`
     (current `access/` content) and `permissions/`.
   - Redirects: `/admin` → `/admin/organization/users`; `/admin/organization`
     and `/admin/portal` → their first tab.
4. **Old-route redirects**: `/admin/{users,departments,plants}` →
   `/admin/organization/...`; `/admin/roles` → `/admin/organization/departments`;
   `/admin/access` → `/admin/portal/modules`; `/admin/permissions` →
   `/admin/portal/permissions` (minimal `redirect()` pages).
5. **`ADMIN_NAV_SECTION` down to 2 items**: Organización (`Building2`,
   `/admin/organization`) and Portal (`Lock`, `/admin/portal`). Sidebar active
   state already works by prefix.
6. **`modules/org/components/departments-roles-page.tsx`**: composes
   `GroupedDataTable` — groups = real departments only; a **"Sin departamento"**
   fallback group renders only if orphan roles (`department_id NULL`) exist, so
   nothing goes invisible — not a permanent or editable group. "+ rol" inside
   each group opens the role form with the department preselected; keeps both
   modals (department and role) and the current endpoints (`/api/departments`,
   `/api/roles`). Retires `roles-table-page.tsx` and
   `departments-table-page.tsx`.
7. **Relax the `admin` department guard**: `updateRole` stops rejecting
   `department_id` for `admin` (rename/deactivate/delete protections stay
   intact); the role form stops disabling the department select for the
   protected role. `docs/modules/rbac.md` gets the new rule ("`admin`
   protection covers name/state/deletion; its department is free").
8. **`modules/org/components/permission-matrix-panel.tsx`**: matrix rows =
   `module.resource` (grouped by module), columns = union of catalog actions,
   checkbox per cell (disabled if the code doesn't exist in the catalog);
   profile selector on top + **"copy permissions from another profile"** (loads
   the source profile's grants into local state; persisted with Guardar). Same
   replace-set API (`/api/roles/[id]/permissions`). Retires
   `permission-grants-panel.tsx`.
9. **UI renames** in titles/subtitles and tabs: "Perfiles de acceso"→"Roles"
   (inside the *Departamentos y roles* tab), "Configuración de accesos a
   módulos"→"Módulos", "Permisos por acción"→"Permisos".

Then: `docs-sync` (navigation.md, rbac.md, STATE.md reflect the new routes and
the 2 kit components) and verification (`pnpm lint && pnpm build` + visual pass
over the 5 views and the redirects).

## Data setup (not a migration)

"Digitalización" is user data, not a migration seed (departments are managed by
the panel, unlike nav sections/permissions). During verification the department
**Digitalización** is created in `EBI_dev` via the new UI and the `admin` role
is assigned to it — an end-to-end test of the grouped flow. In production the
same 2 clicks post-deploy.

## Database impact

None. No migrations, no changes to `nav_*`, `role_*` tables or APIs. Routes,
components and composition only.

## Amendments

<!-- Appended during the verification phase, never edited into the sections
above. -->

- 2026-07-03 — `docs/architecture/module-blueprint.md` referenced the retired
  `/admin/access` and `/admin/permissions` routes (flagged by docs-sync,
  outside this plan's `touches:`); updated to `/admin/portal/{modules,
  permissions}` in the same pass. Objective unaffected.
- 2026-07-03 — Data setup executed in `EBI_dev` during verification:
  department **Digitalización** created (id 6) and the `admin` role assigned
  to it through the relaxed guard (PUT `/api/roles/1` → 200, persisted).
  Production still needs the same 2 clicks post-deploy.
- 2026-07-03 — `pnpm build` initially failed on a stale generated
  `.next/dev/types/routes.d.ts` from a previous dev-server run; cleaning
  `.next` fixed it (environment artifact, not a plan gap).
- 2026-07-03 — Post-delivery UX adjustments requested in-session:
  (a) `GroupedDataTable` groups now start **collapsed**, with a toolbar
  collapse/expand-all icon button; (b) the per-group "add child" moved from a
  labeled header button into the group's row actions as a "+" icon (tooltip
  text via `addChildLabel` — the kit component stays generic); (c) both kit
  tables now use an icon-only toolbar: "+" for add (label became the
  tooltip/aria-label) and the Activos/Inactivos switch is Eye/EyeOff icons
  with counts (labels in tooltips). Shared via the exported
  `ActiveInactiveToggle`, so `DataTable` pages inherited it with no changes.
  Verified: lint + build clean, DOM checks on departamentos (collapsed by
  default, expand-all → 8 rows, 3 "+" buttons, none on the synthetic group)
  and plantas (icon-only "Nueva planta", Eye/EyeOff counts). Objective holds.
