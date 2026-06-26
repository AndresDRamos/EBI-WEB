# Data dictionary — EBI database

> Generated from the live schema by `/sync-docs` (read-only `ebi-sql-dev` MCP).
> Do not edit by hand; rerun `/sync-docs` after applying migrations.
>
> Last synced: 2026-06-26. Reflects V1 + V2 + V3.

---

## Schema `dbo`

### `dbo.report_category`

Lookup table that groups reports into navigation categories.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| category_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| name | nvarchar(120) | no | UQ | Display name for the category |
| sort_order | int | no | DEFAULT 0 | Display order in the portal navigation |

### `dbo.report`

Central catalog of Power BI reports embedded in the portal.  
Replaces public "Publish to web" URLs.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| report_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| name | nvarchar(200) | no | | Display name in the portal |
| workspace_guid | nvarchar(64) | no | UQ with report_guid | Power BI workspace ID |
| report_guid | nvarchar(64) | no | UQ with workspace_guid | Power BI report ID |
| dataset_guid | nvarchar(64) | yes | | Power BI dataset ID (used for embed token when set) |
| category_id | int | yes | FK → dbo.report_category | Navigation category; NULL means uncategorized |
| description | nvarchar(1000) | yes | | Optional long description |
| sort_order | int | no | DEFAULT 0 | Display order within the category |
| is_active | bit | no | DEFAULT 1 | Controls visibility in the portal |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_report_category (category_id) WHERE category_id IS NOT NULL`, `IX_report_active (is_active)`.

---

## Schema `etl`

Auditing and control tables for the EPS→EBI ETL pipeline.

### `etl.run_log`

One row per ETL execution per source entity. Drives incremental/watermark logic.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| run_id | bigint | no | PK, IDENTITY(1,1) | Surrogate primary key |
| entity | nvarchar(128) | no | | Source entity or mapping name (e.g. `eps.orden_produccion`) |
| started_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC run start timestamp |
| finished_at | datetime2(0) | yes | | UTC run end timestamp; NULL while status is `running` |
| status | nvarchar(20) | no | DEFAULT `running` | One of: `running`, `success`, `failed` |
| rows_loaded | int | yes | | Number of rows inserted/merged in this run |
| watermark | nvarchar(64) | yes | | Last processed watermark value (date string or rowversion hex) |
| message | nvarchar(2000) | yes | | Error message or informational note |

Indexes: `IX_etl_run_log_entity (entity, started_at DESC)`.

---

## Schema `auth`

Portal-owned authentication and RBAC. JWT sessions (no session table).  
See ADR `docs/architecture/adr/0001-portal-owned-auth.md`.

### `auth.app_user`

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

### `auth.role`

RBAC role catalog. Seeded with `admin` and `viewer`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| role_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| name | nvarchar(40) | no | UQ | Role name (`admin`, `viewer`) |
| description | nvarchar(256) | yes | | Human-readable description |

### `auth.plant`

Plant catalog managed by portal admins. May later map to EPS plant IDs.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| plant_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short plant code |
| name | nvarchar(160) | no | | Full plant name |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

### `auth.department`

Department catalog managed by portal admins.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| department_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| name | nvarchar(160) | no | UQ | Department name |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

### `auth.user_role`

Many-to-many join between `app_user` and `role`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| user_id | int | no | PK, FK → auth.app_user (CASCADE DELETE) | User reference |
| role_id | int | no | PK, FK → auth.role | Role reference |

Indexes: `IX_user_role_role (role_id)`.

### `auth.user_plant`

Many-to-many join between `app_user` and `plant`.  
Ignored for users where `all_plants = 1`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| user_id | int | no | PK, FK → auth.app_user (CASCADE DELETE) | User reference |
| plant_id | int | no | PK, FK → auth.plant | Plant reference |

Indexes: `IX_user_plant_plant (plant_id)`.

### `auth.user_department`

Many-to-many join between `app_user` and `department`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| user_id | int | no | PK, FK → auth.app_user (CASCADE DELETE) | User reference |
| department_id | int | no | PK, FK → auth.department | Department reference |

Indexes: `IX_user_department_department (department_id)`.

### `auth.invitation`

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
