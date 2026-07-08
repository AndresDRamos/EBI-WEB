# Data dictionary — schema `auth`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-08 (V1–V16). Index: [`_index.md`](_index.md).

Portal-owned authentication and RBAC. JWT sessions (no session table).
See ADR `docs/architecture/adr/0001-portal-owned-auth.md`.

## `auth.app_user`

Portal user accounts. Login identity is `username`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| user_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| username | nvarchar(64) | no | UQ | Login identifier |
| email | nvarchar(256) | yes | | Optional email (used for invitations / notifications) |
| display_name | nvarchar(160) | yes | | Human-readable name shown in the portal |
| password_hash | nvarchar(256) | yes | | argon2id/bcrypt hash; NULL until invitation accepted |
| all_plants | bit | no | DEFAULT 0 | When 1, `auth.user_plant` rows are ignored and user sees all plants |
| is_active | bit | no | DEFAULT 1 | Soft-delete / account disable flag |
| token_version | int | no | DEFAULT 0 | Increment to invalidate all existing JWTs for this user |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

## `auth.role`

RBAC role catalog. Seeded with `admin` and `viewer`. Since V8 a role means
**access profile** (ADR 0004): optionally scoped to a department via
`department_id` (NULL = cross-department/transversal profile). The protected
`admin` profile bypasses grants at the app layer — it has no rows in
`role_permission`, `role_nav_section` nor `role_nav_item`, ever.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| role_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| name | nvarchar(40) | no | UQ | Role name (`admin`, `viewer`) |
| description | nvarchar(256) | yes | | Human-readable description |
| is_active | bit | no | DEFAULT 1 | Soft-disable flag for non-system roles. Only `admin` is protected from deactivation at the application layer (no DB constraint) |
| department_id | int | yes | FK → auth.department (no cascade) | Department the access profile is scoped to; NULL = cross-department (added V8) |

Indexes: `IX_role_department (department_id) WHERE department_id IS NOT NULL`.

> **`plant` moved out in V15.** The plant catalog is now `org.plant` — see
> [`org.md`](org.md). `auth.user_plant` stays here; its `plant_id` is now a
> cross-schema FK to `org.plant`.

## `auth.department`

Department catalog managed by portal admins.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| department_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| name | nvarchar(160) | no | UQ | Department name |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |
| description | nvarchar(256) | yes | | Optional human-readable description (added V4) |

## `auth.user_role`

Many-to-many join between `app_user` and `role`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| user_id | int | no | PK, FK → auth.app_user (CASCADE DELETE) | User reference |
| role_id | int | no | PK, FK → auth.role | Role reference |

Indexes: `IX_user_role_role (role_id)`.

## `auth.user_plant`

Many-to-many join between `app_user` and `plant` (identity scoping: which
plants a user may see). Ignored for users where `all_plants = 1`. Stays in
`auth`; since V15 its `plant_id` is a **cross-schema FK to `org.plant`**.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| user_id | int | no | PK, FK → auth.app_user (CASCADE DELETE) | User reference |
| plant_id | int | no | PK, FK → org.plant (no cascade; cross-schema since V15) | Plant reference |

Indexes: `IX_user_plant_plant (plant_id)`.

## `auth.user_department`

Many-to-many join between `app_user` and `department`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| user_id | int | no | PK, FK → auth.app_user (CASCADE DELETE) | User reference |
| department_id | int | no | PK, FK → auth.department | Department reference |

Indexes: `IX_user_department_department (department_id)`.

## `auth.invitation`

One-time tokens to activate pre-created inactive user accounts.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| invitation_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| user_id | int | no | FK → auth.app_user (CASCADE DELETE) | The pre-created user being invited |
| token_hash | nvarchar(128) | no | UQ | Hash of the one-time token (raw token is never stored) |
| expires_at | datetime2(0) | no | | UTC expiry timestamp |
| accepted_at | datetime2(0) | yes | | UTC timestamp when the invitation was accepted; NULL if pending |
| created_by | int | yes | FK → auth.app_user (no cascade) | Admin user who issued the invitation |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |

Indexes: `IX_invitation_user (user_id)`.

## `auth.nav_section`

Topbar sections of the portal nav registry. `code` is the stable key used by
the codebase; `base_path` is the route base owned by the module's code (not
admin-editable). Seeded by the migration of the module that owns the route —
the admin panel edits `label`/`icon`/`sort_order`/`is_active` and role grants,
but never creates a section from scratch. See `docs/modules/navigation.md`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| section_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(40) | no | UQ | Stable key, e.g. `maintenance` |
| label | nvarchar(80) | no | | Admin-editable display name |
| icon | nvarchar(64) | yes | | `lucide-react` icon name; app falls back if unset |
| base_path | nvarchar(120) | no | UQ, CHECK LIKE `/%` | Route base owned by code |
| sort_order | int | no | DEFAULT 0 | Topbar / tie-break order |
| is_active | bit | no | DEFAULT 1 | Controls visibility in the portal nav |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp (app-maintained) |

## `auth.nav_item`

Sidebar entries per section. One-level nesting via `parent_item_id`, enforced
by a composite self-FK `(section_id, parent_item_id) → (section_id, item_id)`
so a parent must belong to the same section; nesting depth (max 1) is
app-enforced, not a DB constraint.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| item_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| section_id | int | no | FK → auth.nav_section (CASCADE DELETE), UQ with item_id | Owning section |
| parent_item_id | int | yes | FK (section_id, parent_item_id) → auth.nav_item (section_id, item_id) (no cascade), CHECK ≠ item_id | Parent item (sub-section of, one level, app-enforced), same section only |
| label | nvarchar(80) | no | | Display label |
| icon | nvarchar(64) | yes | | `lucide-react` icon name |
| href | nvarchar(200) | no | UQ with section_id, CHECK LIKE `/%` | Route; must live under the section's `base_path` (app-validated) |
| sort_order | int | no | DEFAULT 0 | Sidebar order |
| is_active | bit | no | DEFAULT 1 | Controls visibility |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp (app-maintained) |

Indexes: `IX_nav_item_parent (section_id, parent_item_id) WHERE parent_item_id IS NOT NULL`.

## `auth.role_nav_section`

Role → **section order** in the topbar (per role). Since V16 (ADR 0008) this
table **no longer grants** a section: navigation visibility is authorized per
page via `role_nav_item`, and a section is derived-visible ⇔ the role can see
≥1 of its active pages. What survives here is only ordering — lower `priority`
wins; a user's effective section order is `MIN(priority)` across their roles,
then `nav_section.sort_order`. Structurally unchanged by V16 (no columns
dropped/renamed). The protected `admin` role needs no rows — it sees every
active section at the app layer (same pattern as `RoleProtectedError`).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| role_id | int | no | PK, FK → auth.role (no cascade) | Role reference |
| section_id | int | no | PK, FK → auth.nav_section (CASCADE DELETE) | Section reference |
| priority | int | no | DEFAULT 100 | Lower wins; topbar section-order tie-break across a user's roles (order only since V16, no longer a grant) |

Indexes: `IX_role_nav_section_section (section_id)`.

## `auth.role_nav_item`

Role → **page visibility** grant with intra-section order (added V16, ADR
0008). This is the **source of truth** for whether a role can see/reach a nav
page (`nav_item`): the nav resolver (`getGrantedNav`) and the page guard
(`requireSectionOrRedirect`) both key off it. `priority` orders the pages
*within their section* for that role (lower = earlier; ties break on
`nav_item.sort_order`). A section shows to a role ⇔ the role has ≥1 row here
for an active `nav_item` of that section (derived, app-layer rule — not SQL).
Backfilled at migration time from every existing `role_nav_section` grant
(one row per active item of the granted section, `priority = nav_item.sort_order`).
The protected `admin` role holds no rows — it sees every active page at the
app layer (same bypass as `role_nav_section` / `role_permission`).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| role_id | int | no | PK, FK → auth.role (no cascade; app 409s on role delete) | Role reference |
| item_id | int | no | PK, FK → auth.nav_item (CASCADE DELETE) | Page reference; grants die with their page |
| priority | int | no | DEFAULT 100 | Lower wins; intra-section page order for this role |

Indexes: `IX_role_nav_item_item (item_id)`.

> **Permission `navigation.grants:update`.** The `code` is unchanged by V16,
> but its meaning widened: it previously gated assigning **section**
> visibility (`PUT /api/roles/[id]/sections` over `role_nav_section`); since
> ADR 0008 it also gates assigning **page** visibility + per-role page order
> (`PUT /api/roles/[id]/items` over `role_nav_item`). Same permission, now
> page-granular.

## `auth.permission`

Permission catalog for resource+action RBAC (plan 0006). `code` is the stable
key referenced by the codebase (`requirePermission("...")` / `useCan()`), in
the format `<module>.<resource>:<action>` (e.g. `maintenance.asset:create`),
lowercase-enforced by a CHECK with binary collation. Rows are seeded by module
migrations only (V8 seeded 35 codes for org/reports/navigation/maintenance;
V10 deleted the 6 inert `reports.*` codes; V11 added 6 `production.*` codes;
V15 added 4 `org.process:*` / `org.plant_process:assign` codes and deleted the
3 `maintenance.process:*` codes); the admin panel assigns/revokes grants but
never creates permissions. There is
no `is_active`: retiring a permission = a migration deletes it (grants
cascade). See `docs/modules/rbac.md`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| permission_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(80) | no | UQ, CHECK format `<module>.<resource>:<action>` (lowercase alphanumerics + `._:`) | Stable key used by the codebase |
| description | nvarchar(256) | yes | | Human-readable description shown in the grants panel |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp (app-maintained) |

## `auth.role_permission`

Access profile → permission grant. Ships empty (V8): the only user at
migration time was `admin`, which bypasses at the app layer and must never
hold grant rows (same rule as `role_nav_section`). The app replaces a
profile's full grant set in one transaction (`setRolePermissions`).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| role_id | int | no | PK, FK → auth.role (no cascade) | Access profile reference (app clears grants on role delete, or 409s) |
| permission_id | int | no | PK, FK → auth.permission (CASCADE DELETE) | Permission reference; grants die with their permission |

Indexes: `IX_role_permission_permission (permission_id)`.
