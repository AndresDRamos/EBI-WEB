# ADR 0004 — `auth.role` is an access profile; permissions are resource+action grants

- **Status:** Accepted — 2026-07-02
- **Context plan:** [0006 — RBAC actions](../../plans/0006-rbac-actions.md)

## Context

The portal needed action-level authorization (ADR 0003 §"action-level permissions"):
every sensitive mutation gated by an admin-assignable permission, at button/endpoint
granularity. Two design questions had to be settled first:

1. **Who is the subject of a grant?** `auth.role` had been populated with *job titles*
   (Gerente de planta, Operador, Materialista) — organizational facts, not access
   profiles. The natural subject is the *department + job* pair: a "Técnico" in
   Mantenimiento is not the same effective role as a "Técnico" in Calidad. Meanwhile
   `user_role` and `user_department` are independent sets, so hanging grants off the
   `(department, role)` pair makes every authorization query resolve a cartesian
   ambiguity nobody decided (verified state at decision time: 1 user total, 0 users
   on job-title roles — remodeling was free).
2. **Where do permissions live and who creates them?** Runtime-created permissions
   drift from the code that enforces them.

## Decision

- **`auth.role` now means ACCESS PROFILE** (same table name — renaming would ripple
  through kysely-codegen types, `PROTECTED_ROLE` and the JWT session callbacks for
  purely cosmetic gain). V8 adds `department_id INT NULL` (FK → `auth.department`,
  NO ACTION): a profile either belongs to one department ("Técnico Mantenimiento")
  or is cross-department (`NULL` — like `admin`). `UQ_role_name` stays global; the
  name encodes the department by readable convention.
- **`user_role` remains the single assignment edge.** The profile already carries its
  department, so assignment is unambiguous — no user–department–job triple table.
  `user_department` stays a pure data-scoping dimension (future Power BI RLS via
  `effectiveIdentity`, ADR 0001 — unchanged).
- **`auth.permission`** holds the catalog, `code = '<module>.<resource>:<action>'`
  (e.g. `maintenance.asset:create`), lowercase, CHECK-enforced. **Seeded by module
  migrations only** (V8 seeds the four existing modules retroactively); the admin
  panel grants/revokes but never creates — same rule as `nav_section` (plan 0005).
  Retiring a permission = a migration deletes it (grants cascade).
- **`auth.role_permission`** is the grant table (bare `(role_id, permission_id)`).
  The protected **`admin` profile bypasses at the app layer and never has grant
  rows** — identical to `getNavForUser` / `role_nav_section`.
- **Enforcement:** `requirePermission(code)` in every mutation API route (per-request
  DB resolution — no permission caching in the JWT, so revocation is immediate and
  the cookie stays small). Client: `useCan()` from `PermissionsProvider`, seeded
  server-side in the portal layout (`unstable_cache` tag `"permissions"`), used only
  to show/hide actions — the API is the barrier.
- **No per-user overrides in v1** (`user_permission` rejected as YAGNI — introduce
  via its own plan when a real case appears).

## Consequences

- Rejected (a) grants on `(department_id NULL-able, role_id)`: ternary key with NULL
  semantics plus the cartesian ambiguity moved into every authorization query.
- Rejected (b) a separate job-title catalog + profile table for v1: textbook
  normalization with zero benefit at current scale; if HR-driven job titles are ever
  needed, they can be introduced later with a trivial data migration because
  profiles will already exist.
- The semantic shift is one-way in practice: once department-scoped profiles hold
  grants, reverting to "role = job title" is a data migration with human decisions,
  not a rollback. `role_permission` content is admin-created configuration that
  lives in no migration — dropping the table after adoption loses it.
- `deleteRole` now clears the profile's grant rows (`role_permission`,
  `role_nav_section`) in-transaction; the 409 on delete remains only for assigned
  users (`user_role` FK).
- Job titles as organizational facts no longer have a home in `auth.role`; that is
  deliberate. The UI relabels the entity "Perfiles de acceso".
