# Data dictionary — EBI database

> Generated from the live schema (read-only `ebi-sql-dev` MCP) by the `docs-sync`
> sub-agent, which runs at the end of every `/build-plan`. Do not edit by hand.
>
> Last synced: 2026-07-02. Reflects V1–V7.

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
| is_active | bit | no | DEFAULT 1 | Soft-disable flag for non-system roles. Only `admin` is protected from deactivation at the application layer (no DB constraint) |

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
| address | nvarchar(256) | yes | | Optional street address (added V4) |
| postal_code | nvarchar(16) | yes | | Optional postal/ZIP code (added V4) |

### `auth.department`

Department catalog managed by portal admins.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| department_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| name | nvarchar(160) | no | UQ | Department name |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |
| description | nvarchar(256) | yes | | Optional human-readable description (added V4) |

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

### `auth.nav_section`

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

### `auth.nav_item`

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

### `auth.role_nav_section`

Role → section visibility grant with topbar priority. Lower `priority` wins;
a user's effective order is `MIN(priority)` across their roles, then
`nav_section.sort_order`. The protected `admin` role needs no rows — it sees
every active section at the app layer (same pattern as `RoleProtectedError`).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| role_id | int | no | PK, FK → auth.role (no cascade) | Role reference |
| section_id | int | no | PK, FK → auth.nav_section (CASCADE DELETE) | Section reference |
| priority | int | no | DEFAULT 100 | Lower wins; topbar tie-break order across a user's roles |

Indexes: `IX_role_nav_section_section (section_id)`.

---

## Schema `maint`

Mantenimiento module (CMMS): asset catalog, documents, spare parts with an
append-only stock ledger, preventive/autonomous maintenance plans and work
orders (calendar source). Enumerations are enforced with named CHECK
constraints (no lookup tables). Soft-delete via `is_active`; `updated_at` is
app-maintained (no triggers). See plan `docs/plans/0004-*` and
`docs/modules/maintenance.md`.

### `maint.process`

Manufacturing process catalog (stamping, welding, ...).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| process_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short process code |
| name | nvarchar(160) | no | | Process name |
| description | nvarchar(512) | yes | | Optional description |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

### `maint.asset`

Machine/equipment catalog. `code` is the internal tag (QR payload).
`parent_asset_id` models sub-assemblies (self-referencing hierarchy; the app decides depth).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| asset_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Internal tag, QR payload |
| name | nvarchar(200) | no | | Asset name |
| brand | nvarchar(120) | yes | | Manufacturer brand |
| model | nvarchar(120) | yes | | Model |
| serial_number | nvarchar(120) | yes | | Serial number |
| plant_id | int | no | FK → auth.plant (no cascade) | Plant where the asset lives |
| location | nvarchar(160) | yes | | Free-text area/cell (v1) |
| criticality | char(1) | no | DEFAULT 'C', CHECK IN ('A','B','C') | Criticality class |
| status | nvarchar(20) | no | DEFAULT `active`, CHECK IN (`active`,`in_repair`,`standby`,`retired`) | Operational status |
| parent_asset_id | int | yes | FK → maint.asset (no cascade), CHECK ≠ asset_id | Parent asset (sub-assembly of) |
| acquisition_date | date | yes | | Acquisition date |
| notes | nvarchar(2000) | yes | | Free notes |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_asset_plant (plant_id, is_active)`, `IX_asset_parent (parent_asset_id) WHERE parent_asset_id IS NOT NULL`.

### `maint.asset_process`

Many-to-many join between `asset` and `process` (multi-process machines, storage).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| asset_id | int | no | PK, FK → maint.asset (CASCADE DELETE) | Asset reference |
| process_id | int | no | PK, FK → maint.process (no cascade) | Process reference |

Indexes: `IX_asset_process_process (process_id)`.

### `maint.asset_restriction`

Operational/safety limitations per asset.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| restriction_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| asset_id | int | no | FK → maint.asset (CASCADE DELETE) | Asset reference |
| restriction_type | nvarchar(20) | no | CHECK IN (`limitation`,`safety`,`operational`) | Kind of restriction |
| description | nvarchar(max) | no | | Restriction text |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_asset_restriction_asset (asset_id)`.

### `maint.asset_document`

Document metadata; file bytes live in Azure Blob Storage (`blob_path`).
No cascade from `asset`: `plan_task` may reference a document as visual aid, so
documents are removed explicitly by the app (soft-delete via `is_active`).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| document_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| asset_id | int | no | FK → maint.asset (no cascade) | Asset reference |
| doc_type | nvarchar(24) | no | CHECK IN (`manual`,`electrical_diagram`,`pneumatic_diagram`,`dxf_topview`,`photo`,`other`) | Document kind |
| title | nvarchar(200) | no | | Display title |
| blob_path | nvarchar(400) | no | | Azure Blob Storage key (container-relative) |
| content_type | nvarchar(120) | yes | | MIME type |
| file_size_bytes | bigint | yes | CHECK ≥ 0 (or NULL) | File size |
| version | int | no | DEFAULT 1 | Document version |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| uploaded_by | int | no | FK → auth.app_user (no cascade) | Uploader (authorship preserved) |
| uploaded_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC upload timestamp |

Indexes: `IX_asset_document_asset (asset_id, doc_type)`.

### `maint.spare_part`

Spare-part catalog (single maintenance warehouse in v1).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| spare_part_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Short part code |
| name | nvarchar(200) | no | | Part name |
| description | nvarchar(512) | yes | | Optional description |
| uom | nvarchar(10) | no | DEFAULT `pz` | Unit of measure |
| min_stock | decimal(9,2) | yes | CHECK ≥ 0 (or NULL) | Minimum stock threshold |
| unit_cost | decimal(12,2) | yes | CHECK ≥ 0 (or NULL) | Reference unit cost |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

There is no maintained stock column: current stock = `SUM(quantity)` over
`maint.stock_movement` per part (served by `IX_stock_movement_part`).

### `maint.maintenance_plan`

Preventive/autonomous plan per asset. Calendar-based frequency in v1
(`frequency_unit` is extensible to meter-based units later). `next_due_date`
is the app-maintained scheduler cursor, advanced on completion per `schedule_mode`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| plan_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| asset_id | int | no | FK → maint.asset (no cascade) | Asset the plan applies to |
| plan_type | nvarchar(20) | no | CHECK IN (`preventive`,`autonomous`) | Plan kind |
| name | nvarchar(200) | no | | Plan name |
| description | nvarchar(1000) | yes | | Optional description |
| frequency_value | int | no | CHECK > 0 | Frequency amount |
| frequency_unit | nvarchar(10) | no | CHECK IN (`day`,`week`,`month`) | Frequency unit |
| estimated_minutes | int | yes | CHECK > 0 (or NULL) | Estimated execution time |
| schedule_mode | nvarchar(30) | no | DEFAULT `fixed_calendar`, CHECK IN (`fixed_calendar`,`floating_after_completion`) | How the next date is computed |
| next_due_date | date | yes | | App-maintained scheduler cursor |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag (plans are deactivated, not dropped) |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `IX_maintenance_plan_asset (asset_id)`,
`IX_maintenance_plan_due (next_due_date) INCLUDE (asset_id, plan_type, schedule_mode, frequency_value, frequency_unit) WHERE is_active = 1 AND next_due_date IS NOT NULL`.

### `maint.plan_task`

Ordered checklist template of a plan.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| plan_task_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| plan_id | int | no | FK → maint.maintenance_plan (CASCADE DELETE), UQ with seq | Plan reference |
| seq | int | no | CHECK > 0, UQ with plan_id | Position in the checklist |
| title | nvarchar(200) | no | | Task title |
| instructions | nvarchar(max) | yes | | Detailed instructions |
| visual_aid_document_id | int | yes | FK → maint.asset_document (no cascade) | Visual aid for autonomous maintenance |

Indexes: `IX_plan_task_visual_aid (visual_aid_document_id) WHERE visual_aid_document_id IS NOT NULL`.

### `maint.plan_material`

Planned spare-part consumption per plan execution.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| plan_material_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| plan_id | int | no | FK → maint.maintenance_plan (CASCADE DELETE), UQ with spare_part_id | Plan reference |
| spare_part_id | int | no | FK → maint.spare_part (no cascade), UQ with plan_id | Part reference |
| quantity | decimal(9,2) | no | CHECK > 0 | Planned quantity |

Indexes: `IX_plan_material_spare_part (spare_part_id)`.

### `maint.work_order`

Execution record; source of the maintenance calendar. `plan_id` NULL ⇒ ad-hoc
(always for corrective; allowed for preventive/autonomous created outside a
plan). Work orders are history: never cascaded or deleted.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| work_order_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar | — | Computed PERSISTED, UQ index | Folio `WO-000001` derived from the identity value |
| asset_id | int | no | FK → maint.asset (no cascade) | Asset worked on |
| plan_id | int | yes | FK → maint.maintenance_plan (no cascade); CHECK: NULL when wo_type = `corrective` | Originating plan; NULL for ad-hoc |
| wo_type | nvarchar(20) | no | CHECK IN (`preventive`,`autonomous`,`corrective`) | Work-order kind |
| status | nvarchar(20) | no | DEFAULT `scheduled`, CHECK IN (`scheduled`,`in_progress`,`completed`,`cancelled`) | Lifecycle status |
| scheduled_date | date | no | | Calendar date |
| started_at | datetime2(0) | yes | | UTC start timestamp |
| completed_at | datetime2(0) | yes | CHECK ≥ started_at (when both set) | UTC completion timestamp |
| assigned_to | int | yes | FK → auth.app_user (no cascade) | Assigned technician |
| completed_by | int | yes | FK → auth.app_user (no cascade) | User who completed the WO |
| downtime_minutes | int | yes | CHECK ≥ 0 (or NULL) | Asset downtime caused |
| notes | nvarchar(2000) | yes | | Free notes |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Indexes: `UQ_work_order_code (code) UNIQUE`,
`IX_work_order_calendar (scheduled_date) INCLUDE (status, wo_type, asset_id, plan_id, assigned_to)`,
`IX_work_order_asset (asset_id, status)`,
`IX_work_order_open (status, scheduled_date) WHERE status IN ('scheduled','in_progress')`,
`IX_work_order_assigned_to (assigned_to) WHERE assigned_to IS NOT NULL`,
`IX_work_order_plan (plan_id) WHERE plan_id IS NOT NULL`.

### `maint.work_order_task`

Snapshot of plan tasks at WO creation (immutable copy: later plan edits do not
rewrite executed checklists).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| work_order_task_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| work_order_id | int | no | FK → maint.work_order (CASCADE DELETE), UQ with seq | Work-order reference |
| seq | int | no | CHECK > 0, UQ with work_order_id | Position in the checklist |
| title | nvarchar(200) | no | | Task title (copied from plan) |
| instructions | nvarchar(max) | yes | | Instructions (copied from plan) |
| is_done | bit | no | DEFAULT 0 | Completion flag |
| done_by | int | yes | FK → auth.app_user (no cascade) | User who checked the task |
| done_at | datetime2(0) | yes | | UTC completion timestamp |
| comment | nvarchar(1000) | yes | | Technician comment |

### `maint.work_order_material`

Actual spare-part consumption per WO. The app records consumption here **and**
writes the matching `out` row in `maint.stock_movement` (this table is the WO
view; the ledger is the truth).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| work_order_material_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| work_order_id | int | no | FK → maint.work_order (CASCADE DELETE), UQ with spare_part_id | Work-order reference |
| spare_part_id | int | no | FK → maint.spare_part (no cascade), UQ with work_order_id | Part reference |
| quantity | decimal(9,2) | no | CHECK > 0 | Actual quantity consumed |

Indexes: `IX_work_order_material_spare_part (spare_part_id)`.

### `maint.stock_movement`

Append-only stock ledger with **signed** quantity: `in` ⇒ quantity > 0,
`out` ⇒ quantity < 0, `adjustment` ⇒ quantity ≠ 0 (sign gives direction).
Current stock = `SUM(quantity)` grouped by `spare_part_id`. Rows are never
updated/deleted by the app; corrections are new adjustments.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| stock_movement_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| spare_part_id | int | no | FK → maint.spare_part (no cascade) | Part reference |
| movement_type | nvarchar(20) | no | CHECK IN (`in`,`out`,`adjustment`) | Movement kind |
| quantity | decimal(9,2) | no | CHECK sign matches movement_type | Signed quantity |
| work_order_id | int | yes | FK → maint.work_order (no cascade) | Set for WO consumption (`out`) |
| moved_by | int | no | FK → auth.app_user (no cascade) | User who recorded the movement |
| moved_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC movement timestamp |
| note | nvarchar(400) | yes | | Optional note |

Indexes: `IX_stock_movement_part (spare_part_id, moved_at) INCLUDE (quantity, movement_type, work_order_id)` (stock SUM + kardex in one index),
`IX_stock_movement_wo (work_order_id) WHERE work_order_id IS NOT NULL`.

### Grants (schema scope)

`GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::maint TO ebi_app`;
`GRANT SELECT ON SCHEMA::maint TO ebi_agent_ro` (issued idempotently in V5 and V6).
