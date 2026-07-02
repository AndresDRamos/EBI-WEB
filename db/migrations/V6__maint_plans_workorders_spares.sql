-- V6__maint_plans_workorders_spares.sql
-- Mantenimiento module (CMMS), part 2 of 2: spare-part catalog + stock ledger,
-- preventive/autonomous maintenance plans, and work orders (calendar source).
-- Depends on V5 (maint.asset, maint.asset_document) and auth (plant, app_user).
--
-- Key decisions (see plan 0004):
--  * Enumerations via named CHECK constraints (consistent with V5).
--  * Stock = ledger only (maint.stock_movement) with SIGNED quantity:
--      in > 0, out < 0, adjustment <> 0 (sign gives direction).
--    Current stock = SUM(quantity) per spare_part, served by a covering index.
--    No maintained stock column and no indexed view in v1 (volumes are small;
--    revisit with an indexed view if stock lookups ever degrade).
--  * work_order.code is a PERSISTED computed folio 'WO-000001' derived from the
--    identity value (unique-indexed; padding overflows past 999,999 WOs, which
--    would then fail loudly on the unique index — acceptable for this scale).
--  * Work orders are history: no cascades into them; task/material child rows
--    cascade from their own header only.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- maint.spare_part — spare-part catalog (single maintenance warehouse in v1)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.spare_part', N'U') IS NULL
BEGIN
    CREATE TABLE maint.spare_part
    (
        spare_part_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_spare_part PRIMARY KEY,
        code          NVARCHAR(32)  NOT NULL,
        name          NVARCHAR(200) NOT NULL,
        description   NVARCHAR(512) NULL,
        uom           NVARCHAR(10)  NOT NULL CONSTRAINT DF_spare_part_uom DEFAULT (N'pz'),
        min_stock     DECIMAL(9,2)  NULL,
        unit_cost     DECIMAL(12,2) NULL,
        is_active     BIT NOT NULL CONSTRAINT DF_spare_part_active DEFAULT (1),
        created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_spare_part_created DEFAULT (SYSUTCDATETIME()),
        updated_at    DATETIME2(0) NOT NULL CONSTRAINT DF_spare_part_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_spare_part_code UNIQUE (code),
        CONSTRAINT CK_spare_part_min_stock CHECK (min_stock IS NULL OR min_stock >= 0),
        CONSTRAINT CK_spare_part_unit_cost CHECK (unit_cost IS NULL OR unit_cost >= 0)
    );
END
GO

-- ---------------------------------------------------------------------------
-- maint.maintenance_plan — preventive/autonomous plan per asset.
-- Calendar-based frequency in v1; frequency_unit is extensible to meter-based
-- units later (add e.g. 'cycle'/'hour_run' to the CHECK + a meter source).
-- next_due_date is app-maintained on completion (per schedule_mode).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.maintenance_plan', N'U') IS NULL
BEGIN
    CREATE TABLE maint.maintenance_plan
    (
        plan_id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_maintenance_plan PRIMARY KEY,
        asset_id          INT NOT NULL,
        plan_type         NVARCHAR(20) NOT NULL,
        name              NVARCHAR(200) NOT NULL,
        description       NVARCHAR(1000) NULL,
        frequency_value   INT NOT NULL,
        frequency_unit    NVARCHAR(10) NOT NULL,
        estimated_minutes INT NULL,
        schedule_mode     NVARCHAR(30) NOT NULL CONSTRAINT DF_maintenance_plan_mode DEFAULT (N'fixed_calendar'),
        next_due_date     DATE NULL,                      -- app-maintained scheduler cursor
        is_active         BIT NOT NULL CONSTRAINT DF_maintenance_plan_active DEFAULT (1),
        created_at        DATETIME2(0) NOT NULL CONSTRAINT DF_maintenance_plan_created DEFAULT (SYSUTCDATETIME()),
        updated_at        DATETIME2(0) NOT NULL CONSTRAINT DF_maintenance_plan_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_maintenance_plan_type CHECK (plan_type IN (N'preventive', N'autonomous')),
        CONSTRAINT CK_maintenance_plan_freq_value CHECK (frequency_value > 0),
        CONSTRAINT CK_maintenance_plan_freq_unit CHECK (frequency_unit IN (N'day', N'week', N'month')),
        CONSTRAINT CK_maintenance_plan_mode
            CHECK (schedule_mode IN (N'fixed_calendar', N'floating_after_completion')),
        CONSTRAINT CK_maintenance_plan_est_minutes
            CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
        CONSTRAINT FK_maintenance_plan_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id)             -- no cascade: plans are deactivated, not dropped
    );

    CREATE INDEX IX_maintenance_plan_asset ON maint.maintenance_plan (asset_id);
    CREATE INDEX IX_maintenance_plan_due
        ON maint.maintenance_plan (next_due_date)
        INCLUDE (asset_id, plan_type, schedule_mode, frequency_value, frequency_unit)
        WHERE is_active = 1 AND next_due_date IS NOT NULL;
END
GO

-- ---------------------------------------------------------------------------
-- maint.plan_task — ordered checklist template of a plan
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.plan_task', N'U') IS NULL
BEGIN
    CREATE TABLE maint.plan_task
    (
        plan_task_id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plan_task PRIMARY KEY,
        plan_id                INT NOT NULL,
        seq                    INT NOT NULL,
        title                  NVARCHAR(200) NOT NULL,
        instructions           NVARCHAR(MAX) NULL,
        visual_aid_document_id INT NULL,                  -- visual aid for autonomous maint.
        CONSTRAINT UQ_plan_task_seq UNIQUE (plan_id, seq),
        CONSTRAINT CK_plan_task_seq CHECK (seq > 0),
        CONSTRAINT FK_plan_task_plan FOREIGN KEY (plan_id)
            REFERENCES maint.maintenance_plan (plan_id) ON DELETE CASCADE,
        CONSTRAINT FK_plan_task_visual_aid FOREIGN KEY (visual_aid_document_id)
            REFERENCES maint.asset_document (document_id) -- no cascade: block deleting referenced docs
    );

    CREATE INDEX IX_plan_task_visual_aid ON maint.plan_task (visual_aid_document_id)
        WHERE visual_aid_document_id IS NOT NULL;
END
GO

-- ---------------------------------------------------------------------------
-- maint.plan_material — planned spare-part consumption per plan execution
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.plan_material', N'U') IS NULL
BEGIN
    CREATE TABLE maint.plan_material
    (
        plan_material_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plan_material PRIMARY KEY,
        plan_id          INT NOT NULL,
        spare_part_id    INT NOT NULL,
        quantity         DECIMAL(9,2) NOT NULL,
        CONSTRAINT UQ_plan_material UNIQUE (plan_id, spare_part_id),
        CONSTRAINT CK_plan_material_qty CHECK (quantity > 0),
        CONSTRAINT FK_plan_material_plan FOREIGN KEY (plan_id)
            REFERENCES maint.maintenance_plan (plan_id) ON DELETE CASCADE,
        CONSTRAINT FK_plan_material_spare_part FOREIGN KEY (spare_part_id)
            REFERENCES maint.spare_part (spare_part_id)   -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_plan_material_spare_part ON maint.plan_material (spare_part_id);
END
GO

-- ---------------------------------------------------------------------------
-- maint.work_order — execution record; source of the maintenance calendar.
-- plan_id NULL => ad-hoc (always for corrective; allowed for preventive/
-- autonomous created outside a plan). Historical: never cascaded/deleted.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.work_order', N'U') IS NULL
BEGIN
    CREATE TABLE maint.work_order
    (
        work_order_id    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_order PRIMARY KEY,
        code             AS (N'WO-' + RIGHT(N'000000' + CAST(work_order_id AS NVARCHAR(10)), 6)) PERSISTED,
        asset_id         INT NOT NULL,
        plan_id          INT NULL,
        wo_type          NVARCHAR(20) NOT NULL,
        status           NVARCHAR(20) NOT NULL CONSTRAINT DF_work_order_status DEFAULT (N'scheduled'),
        scheduled_date   DATE NOT NULL,
        started_at       DATETIME2(0) NULL,
        completed_at     DATETIME2(0) NULL,
        assigned_to      INT NULL,
        completed_by     INT NULL,
        downtime_minutes INT NULL,
        notes            NVARCHAR(2000) NULL,
        created_at       DATETIME2(0) NOT NULL CONSTRAINT DF_work_order_created DEFAULT (SYSUTCDATETIME()),
        updated_at       DATETIME2(0) NOT NULL CONSTRAINT DF_work_order_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_work_order_type CHECK (wo_type IN (N'preventive', N'autonomous', N'corrective')),
        CONSTRAINT CK_work_order_status
            CHECK (status IN (N'scheduled', N'in_progress', N'completed', N'cancelled')),
        CONSTRAINT CK_work_order_corrective_no_plan
            CHECK (NOT (wo_type = N'corrective' AND plan_id IS NOT NULL)),
        CONSTRAINT CK_work_order_downtime CHECK (downtime_minutes IS NULL OR downtime_minutes >= 0),
        CONSTRAINT CK_work_order_timeline
            CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
        CONSTRAINT FK_work_order_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id),            -- no cascade: WOs are history
        CONSTRAINT FK_work_order_plan FOREIGN KEY (plan_id)
            REFERENCES maint.maintenance_plan (plan_id),  -- no cascade: keep provenance
        CONSTRAINT FK_work_order_assigned_to FOREIGN KEY (assigned_to)
            REFERENCES auth.app_user (user_id),           -- no cascade
        CONSTRAINT FK_work_order_completed_by FOREIGN KEY (completed_by)
            REFERENCES auth.app_user (user_id)            -- no cascade (avoids multiple cascade paths)
    );

    CREATE UNIQUE INDEX UQ_work_order_code ON maint.work_order (code);
    CREATE INDEX IX_work_order_calendar
        ON maint.work_order (scheduled_date)
        INCLUDE (status, wo_type, asset_id, plan_id, assigned_to);
    CREATE INDEX IX_work_order_asset ON maint.work_order (asset_id, status);
    CREATE INDEX IX_work_order_open
        ON maint.work_order (status, scheduled_date)
        WHERE status IN (N'scheduled', N'in_progress');
    CREATE INDEX IX_work_order_assigned_to ON maint.work_order (assigned_to)
        WHERE assigned_to IS NOT NULL;
    CREATE INDEX IX_work_order_plan ON maint.work_order (plan_id)
        WHERE plan_id IS NOT NULL;
END
GO

-- ---------------------------------------------------------------------------
-- maint.work_order_task — SNAPSHOT of plan tasks at WO creation (immutable
-- copy: later plan edits must not rewrite executed checklists)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.work_order_task', N'U') IS NULL
BEGIN
    CREATE TABLE maint.work_order_task
    (
        work_order_task_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_order_task PRIMARY KEY,
        work_order_id      INT NOT NULL,
        seq                INT NOT NULL,
        title              NVARCHAR(200) NOT NULL,
        instructions       NVARCHAR(MAX) NULL,
        is_done            BIT NOT NULL CONSTRAINT DF_work_order_task_done DEFAULT (0),
        done_by            INT NULL,
        done_at            DATETIME2(0) NULL,
        comment            NVARCHAR(1000) NULL,
        CONSTRAINT UQ_work_order_task_seq UNIQUE (work_order_id, seq),
        CONSTRAINT CK_work_order_task_seq CHECK (seq > 0),
        CONSTRAINT FK_work_order_task_wo FOREIGN KEY (work_order_id)
            REFERENCES maint.work_order (work_order_id) ON DELETE CASCADE,
        CONSTRAINT FK_work_order_task_done_by FOREIGN KEY (done_by)
            REFERENCES auth.app_user (user_id)            -- no cascade
    );
END
GO

-- ---------------------------------------------------------------------------
-- maint.work_order_material — ACTUAL spare-part consumption per WO.
-- The app records consumption here AND writes the matching 'out' row in
-- maint.stock_movement (this table is the WO view; the ledger is the truth).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.work_order_material', N'U') IS NULL
BEGIN
    CREATE TABLE maint.work_order_material
    (
        work_order_material_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_order_material PRIMARY KEY,
        work_order_id          INT NOT NULL,
        spare_part_id          INT NOT NULL,
        quantity               DECIMAL(9,2) NOT NULL,
        CONSTRAINT UQ_work_order_material UNIQUE (work_order_id, spare_part_id),
        CONSTRAINT CK_work_order_material_qty CHECK (quantity > 0),
        CONSTRAINT FK_work_order_material_wo FOREIGN KEY (work_order_id)
            REFERENCES maint.work_order (work_order_id) ON DELETE CASCADE,
        CONSTRAINT FK_work_order_material_spare_part FOREIGN KEY (spare_part_id)
            REFERENCES maint.spare_part (spare_part_id)   -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_work_order_material_spare_part ON maint.work_order_material (spare_part_id);
END
GO

-- ---------------------------------------------------------------------------
-- maint.stock_movement — append-only stock ledger. SIGNED quantity convention:
--   in         => quantity > 0
--   out        => quantity < 0
--   adjustment => quantity <> 0 (either sign)
-- Current stock = SUM(quantity) GROUP BY spare_part_id (covering index below).
-- Rows are never updated/deleted by the app; corrections are new adjustments.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.stock_movement', N'U') IS NULL
BEGIN
    CREATE TABLE maint.stock_movement
    (
        stock_movement_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_stock_movement PRIMARY KEY,
        spare_part_id     INT NOT NULL,
        movement_type     NVARCHAR(20) NOT NULL,
        quantity          DECIMAL(9,2) NOT NULL,          -- signed (see header)
        work_order_id     INT NULL,                       -- set for WO consumption ('out')
        moved_by          INT NOT NULL,
        moved_at          DATETIME2(0) NOT NULL CONSTRAINT DF_stock_movement_moved DEFAULT (SYSUTCDATETIME()),
        note              NVARCHAR(400) NULL,
        CONSTRAINT CK_stock_movement_type CHECK (movement_type IN (N'in', N'out', N'adjustment')),
        CONSTRAINT CK_stock_movement_sign CHECK (
               (movement_type = N'in'         AND quantity > 0)
            OR (movement_type = N'out'        AND quantity < 0)
            OR (movement_type = N'adjustment' AND quantity <> 0)),
        CONSTRAINT FK_stock_movement_spare_part FOREIGN KEY (spare_part_id)
            REFERENCES maint.spare_part (spare_part_id),  -- no cascade: ledger is permanent
        CONSTRAINT FK_stock_movement_wo FOREIGN KEY (work_order_id)
            REFERENCES maint.work_order (work_order_id),  -- no cascade: ledger is permanent
        CONSTRAINT FK_stock_movement_moved_by FOREIGN KEY (moved_by)
            REFERENCES auth.app_user (user_id)            -- no cascade
    );

    CREATE INDEX IX_stock_movement_part
        ON maint.stock_movement (spare_part_id, moved_at)
        INCLUDE (quantity, movement_type, work_order_id); -- stock SUM + kardex in one index
    CREATE INDEX IX_stock_movement_wo ON maint.stock_movement (work_order_id)
        WHERE work_order_id IS NOT NULL;
END
GO

-- ---------------------------------------------------------------------------
-- Grants — V5 already granted at SCHEMA::maint scope (covers new tables).
-- Re-issued idempotently in case V5 ran before the principals existed.
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::maint TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::maint TO ebi_agent_ro');
GO
