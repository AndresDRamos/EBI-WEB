# Data dictionary — schema `maint`

> Maintained by the `docs-sync` sub-agent. Do not edit by hand.
> Last synced: 2026-07-08 (V1–V17; V17 sourced from the applied migration file
> `V17__maint_asset_catalog_redesign.sql` + regenerated Kysely types, not live
> introspection). Index: [`_index.md`](_index.md).

Mantenimiento module (CMMS): asset catalog with configurable category/type
catalogs (V17), documents, spare parts with an append-only stock ledger,
preventive/autonomous maintenance plans and work orders (calendar source).
Fixed enumerations (criticality, status, doc types, WO types…) are enforced
with named CHECK constraints; since V17 the asset category/type hierarchy is
the first `maint` dimension modeled as **configurable catalog tables** instead
(user-defined values + matrícula prefix). Soft-delete via `is_active`;
`updated_at` is app-maintained (no triggers). See plan `docs/plans/0004-*` and
`docs/modules/maintenance.md`.

> **`process` moved out in V15.** The process catalog is now `org.process`
> (company-wide) — see [`org.md`](org.md). `maint.asset_process` stays here;
> its `process_id` is now a cross-schema FK to `org.process`.

## `maint.asset_category`

Configurable asset-category catalog (V17; replaces the V11 CHECK on
`asset.asset_category`). `code_prefix` builds the asset matrícula
(`PRD-P1-0001`); it is UNIQUE so two categories can never collide on the same
prefix. Seeded with the two values migrated from the V11 CHECK:
`production_equipment` (`PRD`) and `material_handling` (`MMH`).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| asset_category_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(40) | no | UQ | Stable machine key |
| name | nvarchar(120) | no | | Spanish UI label |
| code_prefix | nvarchar(8) | no | UQ | Matrícula prefix (e.g. `PRD`) |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

## `maint.asset_type`

Machine types grouped under a category (category → type hierarchy). `code` is
unique **within** a category; the composite unique constraint doubles as the
FK-support index for `asset_category_id`. No seed — users create types.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| asset_type_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| asset_category_id | int | no | FK → maint.asset_category (no cascade), UQ with code | Owning category |
| code | nvarchar(40) | no | UQ with asset_category_id | Stable key, unique per category |
| name | nvarchar(120) | no | | Spanish UI label |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

## `maint.asset_code_sequence`

Race-safe per (category, plant) counter that backs the app-generated matrícula
`{code_prefix}-P{plant_id}-{NNNN}`. `next_seq` is the NEXT value to hand out;
the app locks and increments the row (`UPDLOCK + SERIALIZABLE`) inside the
asset-insert transaction (`createAsset` in `modules/maintenance/db.ts`). No
triggers, no DB default on `asset.code`.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| asset_category_id | int | no | PK (with plant_id), FK → maint.asset_category (no cascade) | Category reference |
| plant_id | int | no | PK (with asset_category_id), FK → org.plant (no cascade; cross-schema) | Plant reference |
| next_seq | int | no | DEFAULT 1, CHECK ≥ 1 | Next sequence value to hand out |

## `maint.asset`

Machine/equipment catalog. `code` is the internal matrícula (QR payload),
**app-generated since V17** (`{prefix}-P{plant_id}-{NNNN}`, never user input).
The asset's category is **derived** via `asset_type → asset_category` (never
stored on the asset). `parent_asset_id` models sub-assemblies
(self-referencing hierarchy; the app decides depth).

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| asset_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| code | nvarchar(32) | no | UQ | Matrícula, QR payload; generated inside `createAsset`'s transaction from `asset_code_sequence` |
| name | nvarchar(200) | no | | Asset name |
| brand | nvarchar(120) | yes | | Manufacturer brand |
| model | nvarchar(120) | yes | | Model |
| serial_number | nvarchar(120) | yes | | Serial number |
| plant_id | int | no | FK → org.plant (no cascade; cross-schema since V15) | Plant where the asset lives |
| asset_type_id | int | no | FK → maint.asset_type (no cascade) (added V17) | Machine type; the category is derived through it |
| criticality | char(1) | no | DEFAULT 'C', CHECK IN ('A','B','C') | Criticality class (still exists; not captured by the current machine form) |
| status | nvarchar(20) | no | DEFAULT `active`, CHECK IN (`active`,`in_repair`,`standby`,`retired`) | Operational status |
| parent_asset_id | int | yes | FK → maint.asset (no cascade), CHECK ≠ asset_id | Parent asset (sub-assembly of) |
| installation_date | date | yes | | Installation date (renamed from `acquisition_date` in V17; the app stores day = 01 for approximate month/year) |
| image_blob_path | nvarchar(400) | yes | | Primary photo key in the Azure Blob `maintenance` container (added V17) |
| notes | nvarchar(2000) | yes | | Free notes |
| is_active | bit | no | DEFAULT 1 | Soft-delete flag |
| created_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC creation timestamp |
| updated_at | datetime2(0) | no | DEFAULT SYSUTCDATETIME() | UTC last-modified timestamp |

Dropped in V17: `asset_category` (nvarchar(20) CHECK + default + `IX_asset_category`,
added V11 — now the derived catalog dimension) and `location` (nvarchar(160)
free text — physical location is historized in `production.asset_cell_assignment`).

Indexes: `IX_asset_plant (plant_id, is_active)`, `IX_asset_parent (parent_asset_id) WHERE parent_asset_id IS NOT NULL`, `IX_asset_type (asset_type_id)` (added V17).

## `maint.asset_process`

Many-to-many join between `asset` and the company-wide process catalog
(multi-process machines, storage). Stays in `maint`; since V15 its `process_id`
is a **cross-schema FK to `org.process`**.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| asset_id | int | no | PK, FK → maint.asset (CASCADE DELETE) | Asset reference |
| process_id | int | no | PK, FK → org.process (no cascade; cross-schema since V15) | Process reference |

Indexes: `IX_asset_process_process (process_id)`.

## `maint.asset_restriction`

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

## `maint.asset_document`

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

## `maint.spare_part`

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

## `maint.maintenance_plan`

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

## `maint.plan_task`

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

## `maint.plan_material`

Planned spare-part consumption per plan execution.

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| plan_material_id | int | no | PK, IDENTITY(1,1) | Surrogate primary key |
| plan_id | int | no | FK → maint.maintenance_plan (CASCADE DELETE), UQ with spare_part_id | Plan reference |
| spare_part_id | int | no | FK → maint.spare_part (no cascade), UQ with plan_id | Part reference |
| quantity | decimal(9,2) | no | CHECK > 0 | Planned quantity |

Indexes: `IX_plan_material_spare_part (spare_part_id)`.

## `maint.work_order`

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

## `maint.work_order_task`

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

## `maint.work_order_material`

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

## `maint.stock_movement`

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

## Grants (schema scope)

`GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::maint TO ebi_app`;
`GRANT SELECT ON SCHEMA::maint TO ebi_agent_ro` (issued idempotently in V5, V6
and V17; the schema-scope grants already cover the three V17 tables).
