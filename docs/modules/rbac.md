# RBAC actions (resource+action permissions)

**Last synced:** 2026-07-07 · **Synced from:** plan 0006-rbac-actions + plan admin-panel-regroup + unified permission manager redesign (`PermissionManager`, two-panel Claude Design mockup — supersedes the first unified-matrix iteration)

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
  state** drives both halves:
  - Left ("Permisos por usuario"): pick a user, click one of that user's
    roles (rendered as chips) to load it — or the right panel's own role
    selector can set the same `roleId` directly. Renders the
    `module.resource:action` catalog as a collapsible accordion per module
    (sticky header, "X/Y concedidos" counter), each `module.resource` row a
    pill/chip toggle per action (not checkboxes). "Guardar permisos" PUTs
    `/api/roles/[id]/permissions`.
  - Right ("Estructura del menú"): a drag-and-drop tree (native HTML5 drag
    events, no DnD library) of nav sections → top-level items → child
    items, with its own "Ver como" role select writing the same `roleId`.
    Each section row has an eye/eye-off icon that **toggles** that role's
    grant (click = revoke/grant, no separate checkbox), and dragging a
    section reorders that role's topbar `priority` (recomputed as
    `index * 10` on drop, only for currently-granted sections) — the
    global `nav_section.sort_order` is untouched by this drag. Dragging
    top-level items or child items instead edits the global
    `nav_item.sort_order` (no per-role axis there). Inline pencil / plus /
    trash icon buttons on every row open dialogs (`EntityFormDialog` /
    `AlertDialog`) to edit a section's label/icon/global sort_order/active
    and to create/edit/delete nav items and their children — this inline
    CRUD is what replaced the deleted Módulos-tab table pages. "Guardar
    acceso y orden" persists both the section grants/priority (PUT
    `/api/roles/[id]/sections`) and any changed item/child `sort_order`
    (one PUT `/api/nav/items/[id]` per changed row).

  Selecting the protected `admin` role (via either panel) shows an "Acceso
  total" card in place of the matrix, and the tree shows every section
  ungated with the eye toggle and section drag disabled (item/child drag
  and CRUD stay active — that's global structure, not a grant). There is no
  "copiar de otro rol" or read-only "Por usuario" aggregate view in this
  iteration — `role_refs` on `AdminUserItem` (`modules/org/db/users.ts`)
  only feeds the left panel's per-user role chips. Page
  `(portal)/admin/portal/permissions`, the sole screen under
  `/admin/portal` (`/admin/portal` redirects there directly — the old
  Módulos/Permisos tab split and its `layout.tsx` `PageTabs` are gone).
  API: `/api/permissions`, `/api/roles/[id]/permissions` (replace-set) and
  `/api/roles/[id]/sections` (replace-set, owned by `modules/navigation`),
  plus `/api/nav/items/[id]` (PUT for sort_order, PUT/DELETE for the inline
  CRUD) and `/api/nav/sections/[id]` (PUT for the section edit dialog).
- Owns the enforcement primitives: `requirePermission(code)` in
  `src/lib/auth/rbac.ts` (server, per-request DB resolution) and `useCan()`
  from `src/components/providers/permissions-provider.tsx` (client, seeded
  server-side in `(portal)/layout.tsx`, cache tag `"permissions"`).
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
      │           → modules/org/db/permissions.ts; admin short-circuits, no query)
      └─ client: (portal)/layout.tsx loads codes per role-set
                 (unstable_cache tag "permissions") → PermissionsProvider → useCan()
```

Mutations that change grants (`PUT /api/roles/[id]/permissions`,
`DELETE /api/roles/[id]`) call `revalidateTag("permissions")` (role delete also
revalidates `"nav"` because it clears `role_nav_section`).

## Related ADRs

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
- **`deleteRole` clears `role_permission` + `role_nav_section` in-transaction**
  and the remaining 409 is the `user_role` FK. Don't add a CHECK or cascade in
  SQL — catalog FKs are NO ACTION by house rule.
