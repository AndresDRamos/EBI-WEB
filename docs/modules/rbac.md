# RBAC actions (resource+action permissions)

**Last synced:** 2026-07-03 · **Synced from:** plan 0006-rbac-actions + plan admin-panel-regroup (matrix panel, `admin` department guard relaxed)

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
  `setRolePermissions`) and the grants UI
  `src/modules/org/components/permission-matrix-panel.tsx` — a matrix per
  profile: rows = `module.resource` grouped by module, columns = the union of
  catalog actions, one checkbox per existing code, plus "copiar de otro
  perfil" (loads the source profile's grants into local state; nothing
  persists until Guardar). Page `(portal)/admin/portal/permissions` (the
  *Permisos* tab; legacy `/admin/permissions` redirects there), API
  `/api/permissions` and `/api/roles/[id]/permissions` (same replace-set
  contract as the retired list panel `permission-grants-panel.tsx`).
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
