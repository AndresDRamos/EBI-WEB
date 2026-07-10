# RBAC actions (resource+action permissions)

**Last synced:** 2026-07-10 · **Synced from:** plan 0006-rbac-actions + plan admin-panel-regroup + unified permission manager redesign (`PermissionManager`, two-panel Claude Design mockup — supersedes the first unified-matrix iteration) + plan 5-cerrar-fronteras (layer-boundaries refactor: `rbac.ts` port/composition-root split, `/api/org/*` + `/api/navigation/nav/*` route namespacing) + plan ui-monoliths-decomposition (`permission-manager.tsx` split into orchestrator + `permissions-panel.tsx` + `nav-access-tree.tsx` + `section-edit-dialog.tsx` + `item-edit-dialog.tsx`; pure UI refactor, no schema/behavior change)

## Purpose

Gates every sensitive portal mutation behind an admin-assignable permission
`<module>.<resource>:<action>` (e.g. `maintenance.asset:create`). The grant
subject is the **access profile** (`auth.role` + optional `department_id` —
ADR 0004); the protected `admin` profile bypasses everything at the app layer
with no grant rows — the bypass keys on the role **name**, never on
`department_id`.

## Responsibilities

- Owns the permission data slice `src/modules/org/db/permissions.ts`
  (`getPermissionCodesForRoles`, `listPermissions`, `listRolePermissionIds`,
  `setRolePermissions`) and the unified grants UI
  `src/modules/org/components/permission-manager.tsx` (`PermissionManager`,
  replaces the retired `permission-matrix-panel.tsx` and navigation's
  `nav-grants-panel.tsx`, `nav-sections-table-page.tsx` and
  `nav-items-panel.tsx`) — a two-panel screen where **one shared `roleId`
  state** drives both halves. **Split** (pure UI refactor,
  ui-monoliths-decomposition, no behavior change) into: `permission-manager.tsx`
  itself (the orchestrator: `PermissionManager`, `FilterBar`, `ModeButton`,
  plus the shared exported types `PermissionOption`/`RoleOption`/
  `UserOption`/`SectionRow`/`ItemRow`), `permissions-panel.tsx`
  (`PermissionsPanel` — the left `module.resource:action` matrix),
  `nav-access-tree.tsx` (`NavAccessTree` — the right page-granular nav tree;
  its internal state is now one `sectionState: Map<sectionId, {topOrder,
  childOrder, grants}>` built by a pure `buildSectionState()` function,
  replacing four separate state pieces and removing an
  `eslint-disable react-hooks/exhaustive-deps`), `section-edit-dialog.tsx`
  (`SectionEditDialog` + the shared `IconPickerField`) and
  `item-edit-dialog.tsx` (`ItemEditDialog`, imports `IconPickerField` from
  `section-edit-dialog.tsx`):
  A single top **filter bar** (mode `Rol ⇄ Usuario`) drives both panels
  through one shared `roleId`: role mode picks a role directly; user mode
  picks a user and renders that user's roles as chips → editing acts on the
  chosen role (grants live on `auth.role`). The right panel no longer has its
  own "Ver como" select.
  - Left ("Control de permisos"): renders the `module.resource:action`
    catalog as a collapsible accordion per module (sticky header,
    "X/Y concedidos" counter), **collapsed by default**, each
    `module.resource` row a pill/chip toggle per action (not checkboxes).
    "Guardar permisos" PUTs `/api/org/roles/[id]/permissions`. Scrolls
    internally (bounded panel height).
  - Right ("Estructura del menú"): a drag-and-drop tree (native HTML5 drag
    events, no DnD library) of nav sections → top-level items → child items.
    Navigation authority is **per page** (ADR 0008, `role_nav_item`): each
    item (and child) row has an eye/eye-off icon that toggles **that page's**
    visibility for the role, and dragging items/children reorders them for
    that role (persisted as `role_nav_item.priority`, `index * 10` on save —
    the global `nav_item.sort_order` is only the default/new-item order). A
    **section is derived-visible** (≥1 visible page) and its eye toggle is a
    bulk grant/revoke of all its pages; a section with no visible pages sinks
    to the end of the tree. Dragging a section reorders that role's topbar
    `priority` (`role_nav_section`, now section-order only). Inline pencil /
    plus / trash buttons open dialogs (`EntityFormDialog` / the kit
    `ConfirmDialog`) to
    edit a section's label/icon/global sort_order/active and to
    create/edit/delete nav pages and children (the icon is rendered next to
    its selector) — this inline CRUD replaced the deleted Módulos-tab tables.
    "Guardar visibilidad y orden" PUTs both `/api/org/roles/[id]/items` (page
    grants + per-role order) and `/api/org/roles/[id]/sections` (section
    order).

  Selecting the protected `admin` role shows an "Acceso total" card in place
  of the matrix, and the tree shows every section/page ungated with the eye
  toggles and drag disabled. Adding a page auto-grants it (server-side) to
  every role that already sees its section, so a new page isn't invisible
  until re-granted. Page `(portal)/admin/portal/permissions`, the sole screen
  under `/admin/portal` (`/admin/portal` redirects there directly — the old
  Módulos/Permisos tab split and its `layout.tsx` `PageTabs` are gone).
  API (namespaced under `/api/org/*` since plan 5-cerrar-fronteras):
  `/api/org/permissions`, `/api/org/roles/[id]/permissions` (replace-set),
  `/api/org/roles/[id]/items` (page grants + order, replace-set) and
  `/api/org/roles/[id]/sections` (section order, replace-set; both owned by
  `modules/navigation`), plus `/api/navigation/nav/items` +
  `/api/navigation/nav/items/[id]` (PUT/POST/DELETE for the inline CRUD) and
  `/api/navigation/nav/sections/[id]`.
- Owns the enforcement primitives: `requirePermission(code)` in
  `src/lib/auth/rbac.ts` (server, per-request DB resolution) and `useCan()`
  from `src/components/providers/permissions-provider.tsx` (client, seeded
  server-side in `(portal)/layout.tsx`, cache tag `"permissions"`). Since
  plan 5-cerrar-fronteras, `rbac.ts` no longer imports
  `modules/org/db/permissions.ts` directly — it stays domain-blind and
  exposes a `configurePermissionCodesLookup(lookup)` port
  (`(roles: string[]) => Promise<string[]>`); the composition root
  `src/auth.ts` wires it to `getPermissionCodesForRoles`
  (`modules/org/db/permissions.ts`) at module init.
- Does **not** own: the permission catalog content — each module's migration
  seeds its own permission rows (V8 seeded org/reports/navigation/maintenance
  retroactively; V11 added `production.*`; V15 added
  `org.process:{create,update,delete}` + `org.plant_process:assign` and
  **retired** `maintenance.process:{create,update,delete}` — the process
  catalog is now governed from the `org` module, not maintenance; blueprint
  §1/§3). Does not own page-level admin gating
  (`assertAdminOrRedirect` on the `/admin` layout stays) nor nav visibility
  (`modules/navigation` — showing a section is unrelated to permitting its
  actions).

## Dependency flow

```
module migration (Vn) → seeds auth.permission rows
      │
auth.role_permission   (admin panel /admin/portal/permissions: replace-set per profile)
      │
      ├─ server: requirePermission(code) — API mutation routes (lib/auth/rbac.ts
      │           → configurePermissionCodesLookup port, wired by src/auth.ts to
      │             modules/org/db/permissions.ts; admin short-circuits, no query)
      └─ client: (portal)/layout.tsx loads codes per role-set
                 (unstable_cache tag "permissions") → PermissionsProvider → useCan()
```

Mutations that change grants (`PUT /api/org/roles/[id]/permissions`,
`DELETE /api/org/roles/[id]`) call `revalidateTag("permissions")`;
nav-visibility mutations (`PUT /api/org/roles/[id]/items`, `.../sections`)
revalidate `"nav"`, and role delete revalidates both (it clears
`role_nav_item` + `role_nav_section`).

## Related ADRs

- [ADR 0008 — page grants authorize pages](../architecture/adr/0008-page-grants-authorize-pages.md)
  (supersedes 0005; per-page nav visibility, `role_nav_item`)
- [ADR 0004 — role as access profile](../architecture/adr/0004-role-as-access-profile.md)
- [ADR 0003 — composition over metadata](../architecture/adr/0003-composition-over-metadata.md) (§action-level permissions)

## Do not touch without reading

- **`admin` never gets grant rows.** `requirePermission`, `useCan` and the
  grants API all special-case it (the PUT even 409s). Adding rows for admin is
  not "fixing" anything — it breaks the invariant shared with nav.
- **`admin` protection covers name/state/deletion — not its department.**
  Since plan admin-panel-regroup, `updateRole` (`modules/org/db/org.ts`)
  accepts `department_id` for the protected profile (it can live under a real
  department); rename/deactivate/delete still throw `RoleProtectedError`. The
  permission/nav bypass keys on the role **name**, never on
  `department_id NULL` — don't re-add the department guard and don't make the
  bypass department-based.
- **Permission codes are contract, not data.** The string in
  `requirePermission("x.y:z")` must exist in `auth.permission` (seeded by a
  migration) or the gate can never pass for non-admins. When adding an
  endpoint, seed its permission in the same plan's migration — codes are
  lowercase `<module>.<resource>:<action>`, CHECK-enforced.
- **`useCan` staleness is accepted by design.** The provider snapshot comes
  from the layout render; a revoked grant may leave a button visible until
  refresh, but the API re-checks per request. Do not "fix" it by caching
  permissions in the JWT — revocation immediacy was the reason for
  per-request resolution (plan 0006, open point 4).
- **GET routes deliberately stay on `requireUser`/`requireAnyRole(["admin"])`.**
  v1 gates mutations only; read-gating is a future decision, not an oversight.
- **`deleteRole` clears `role_permission` + `role_nav_item` +
  `role_nav_section` in-transaction** and the remaining 409 is the `user_role`
  FK. All three grant FKs to `role` are NO ACTION by house rule, so each must
  be deleted here — don't add a CHECK or cascade in SQL, and don't forget a new
  grant table when one is added (V16's `role_nav_item` FK is NO ACTION too).
