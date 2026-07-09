# org

**Last synced:** 2026-07-09 · **Synced from:** `docs/STATE.md` (pre-existing file-by-file map, now retired) + plan org-schema-plant-process (V15) + plan machines-locations-view (`org.location`, V18)

## Purpose

Identity (`auth` schema) and organization (`org` schema) for the EBI portal:
users, roles, departments, permissions and the DB-driven nav grant surface
live under `auth`; plants, processes, locations and their plant↔process
links live under `org` (moved out of `auth`/`maint` in V15 to separate
organization from identity). This is the largest module (6 `db/` files + 11
components) and backs the entire `/admin` panel.

## Responsibilities

- `db/users.ts` — `auth.app_user` + role/plant/department junctions +
  `invitation`. Reads: `findAuthUserByUsername/ById`, `getUserRolesById`,
  `getUserScope`, `listUsers/WithNames`, `getUserDetail`. Writes:
  `createUser`, `updateUserAssignments`, `bumpTokenVersion`,
  `setUserPassword`, `createInvitation` / `accept` / `revoke`.
- `db/org.ts` — `auth.role | department` CRUD (role protection) + `org.plant`
  CRUD. Exports `RoleProtectedError` and `PROTECTED_ROLE = "admin"`.
  `deleteRole` clears the role's grants (`role_permission`, `role_nav_item`,
  `role_nav_section`) in-transaction (409 only if users are still assigned).
- `db/locations.ts` — `org.location` CRUD (per-plant named locations — naves
  de producción, almacenes…, V18); 409 on FK when an asset or a production
  cell still references it.
- `db/processes.ts` — `org.process` CRUD (promoted from `maint.process` in
  V15; company-wide process catalog, administered from the admin panel).
- `db/plant-process.ts` — `org.plant_process` N:M ("which plant runs which
  process"): `listPlantProcessLinks`, `listProcessIdsByPlant`,
  `setPlantProcesses` (replace-set per plant).
- `db/permissions.ts` — `auth.permission | role_permission`:
  `getPermissionCodesForRoles` (hot path for `requirePermission`), catalog
  list + replace-set grants for the admin panel.
- Owns the RBAC helpers consumed by `src/lib/auth/rbac.ts` — that file
  imports only `getPermissionCodesForRoles` from here; `auth()`/session
  concerns stay in `src/auth.ts`.

## Dependency flow

- `(portal)/admin/organization/*` pages → `db/users.ts`, `db/org.ts`,
  `db/locations.ts`, `db/processes.ts`, `db/plant-process.ts`.
- `src/lib/auth/rbac.ts` → `db/permissions.ts` (`getPermissionCodesForRoles`)
  for `requirePermission`.
- `maintenance` and `production` read `org.location` / `org.plant` /
  `org.process` cross-schema (asset location, cell location, type↔process
  links) — `org` does not import from either.

## Related ADRs

- [ADR 0007 — org schema: identity vs. organization](../architecture/adr/0007-org-schema-identity-vs-organization.md)

## Do not touch without reading

- **`auth.role` = access profile, not a department membership** — `admin` is
  protected by name at the app layer (`RoleProtectedError`), not a CHECK
  constraint; `department_id` NULL means cross-department.
- **`org.plant_process` and `maint.asset_type_process` are separate links**
  — do not conflate "plant runs process" (capacity/scope) with "asset type
  supports process" (maintenance's assignment invariant, `docs/modules/maintenance.md`).
