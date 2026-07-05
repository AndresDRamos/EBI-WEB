-- V11__produccion_schema.sql
-- New `produccion` schema (plan production-cell-assignment): splits the free-text
-- maint.asset.location field into three real entities:
--   produccion.production_line       -> optional sequencing container (Op 10 -> 20 -> 30)
--   produccion.cell                  -> logical production post/function (line_id nullable:
--                                       not every cell belongs to a line, e.g. "Laser 1/2")
--   produccion.asset_cell_assignment -> TEMPORAL asset<->cell bridge (M:N, historized,
--                                       never overwritten: closing valid_to + opening a
--                                       new row is how a reassignment is recorded)
-- maint.asset += asset_category (production_equipment | material_handling):
-- material-handling equipment (forklifts, hoists, tippers) shares the maintenance
-- catalog but typically has no fixed cell (shared plant capacity/pool) -- assignment
-- rows stay optional for that category.
-- Enumerations via named CHECK constraints (consistent with maint, V5/V6). FKs to
-- catalogs use NO ACTION (protect rows / preserve history); updated_at is
-- app-maintained (no triggers), consistent with dbo/auth/maint.
-- asset_cell_assignment has NO updated_at on purpose: rows are immutable once
-- written except for closing valid_to -- an updated_at would invite the in-place
-- rewrite this design exists to prevent.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
IF SCHEMA_ID(N'produccion') IS NULL EXEC(N'CREATE SCHEMA produccion');
GO

-- ---------------------------------------------------------------------------
-- produccion.production_line — optional sequencing container for cells
-- (e.g. a welding line with Op 10 -> Op 20 -> Op 30). Not every cell needs one.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'produccion.production_line', N'U') IS NULL
BEGIN
    CREATE TABLE produccion.production_line
    (
        line_id    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_production_line PRIMARY KEY,
        code       NVARCHAR(32)  NOT NULL,
        name       NVARCHAR(160) NOT NULL,
        plant_id   INT NOT NULL,
        is_active  BIT NOT NULL CONSTRAINT DF_production_line_active DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_production_line_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_production_line_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_production_line_code UNIQUE (code),
        CONSTRAINT FK_production_line_plant FOREIGN KEY (plant_id)
            REFERENCES auth.plant (plant_id)               -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_production_line_plant ON produccion.production_line (plant_id, is_active);
END
GO

-- ---------------------------------------------------------------------------
-- produccion.cell — logical production post/function. line_id is NULLABLE:
-- standalone cells (e.g. "Laser 1", "Laser 2") have no line. sequence_in_line
-- is only allowed when line_id is set (CK_cell_sequence_requires_line).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'produccion.cell', N'U') IS NULL
BEGIN
    CREATE TABLE produccion.cell
    (
        cell_id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_cell PRIMARY KEY,
        code             NVARCHAR(32)  NOT NULL,
        name             NVARCHAR(160) NOT NULL,
        plant_id         INT NOT NULL,
        line_id          INT NULL,                         -- optional: not every cell belongs to a line
        sequence_in_line INT NULL,                         -- position within the line (Op order)
        is_active        BIT NOT NULL CONSTRAINT DF_cell_active DEFAULT (1),
        created_at       DATETIME2(0) NOT NULL CONSTRAINT DF_cell_created DEFAULT (SYSUTCDATETIME()),
        updated_at       DATETIME2(0) NOT NULL CONSTRAINT DF_cell_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_cell_code UNIQUE (code),
        CONSTRAINT CK_cell_sequence CHECK (sequence_in_line IS NULL OR sequence_in_line > 0),
        CONSTRAINT CK_cell_sequence_requires_line
            CHECK (line_id IS NOT NULL OR sequence_in_line IS NULL),
        CONSTRAINT FK_cell_plant FOREIGN KEY (plant_id)
            REFERENCES auth.plant (plant_id),              -- no cascade: protect catalog rows
        CONSTRAINT FK_cell_line FOREIGN KEY (line_id)
            REFERENCES produccion.production_line (line_id) -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_cell_plant ON produccion.cell (plant_id, is_active);
    CREATE INDEX IX_cell_line  ON produccion.cell (line_id) WHERE line_id IS NOT NULL;

    -- Prevent duplicate "Op 20" within the same line. Filtered so the rule only
    -- applies when line_id is populated -- "no line" cells stay unconstrained by
    -- sequence. Same filtered-index pattern as IX_asset_parent in V5.
    CREATE UNIQUE INDEX UQ_cell_line_sequence
        ON produccion.cell (line_id, sequence_in_line)
        WHERE line_id IS NOT NULL;
END
GO

-- ---------------------------------------------------------------------------
-- produccion.asset_cell_assignment — TEMPORAL M:N bridge, asset <-> cell.
-- Real M:N: a cell can be composed of several assets (e.g. "Laser 1" = laser
-- machine + feed tower) and one asset can serve several cells at once (the
-- feed tower serves "Laser 1" and "Laser 2" simultaneously). Reassignment is
-- historized: close the current row (valid_to), open a new one -- never
-- UPDATE cell_id in place. NO ACTION on both asset_id and cell_id: history
-- must survive the asset or the cell being logically retired.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'produccion.asset_cell_assignment', N'U') IS NULL
BEGIN
    CREATE TABLE produccion.asset_cell_assignment
    (
        assignment_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_cell_assignment PRIMARY KEY,
        asset_id      INT NOT NULL,
        cell_id       INT NOT NULL,
        role_label    NVARCHAR(120) NULL,                  -- e.g. 'Laser 1 - position 1', 'Feed tower - shared'
        valid_from    DATE NOT NULL CONSTRAINT DF_asset_cell_assignment_from DEFAULT (CAST(SYSUTCDATETIME() AS DATE)),
        valid_to      DATE NULL,                           -- NULL = currently in effect
        created_by    INT NOT NULL,
        note          NVARCHAR(1000) NULL,
        created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_asset_cell_assignment_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_asset_cell_assignment_range CHECK (valid_to IS NULL OR valid_to >= valid_from),
        CONSTRAINT FK_asset_cell_assignment_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id),             -- no cascade: preserve history if asset is retired
        CONSTRAINT FK_asset_cell_assignment_cell FOREIGN KEY (cell_id)
            REFERENCES produccion.cell (cell_id),          -- no cascade: preserve history if cell is retired
        CONSTRAINT FK_asset_cell_assignment_created_by FOREIGN KEY (created_by)
            REFERENCES auth.app_user (user_id)             -- no cascade: preserve authorship history
    );

    -- "Where is asset X today / its history" and "what's in cell Y today"
    CREATE INDEX IX_asset_cell_assignment_asset ON produccion.asset_cell_assignment (asset_id, valid_from);
    CREATE INDEX IX_asset_cell_assignment_cell  ON produccion.asset_cell_assignment (cell_id, valid_from);

    -- One CURRENT assignment per (asset, cell) pair -- does not limit how many
    -- distinct cells an asset currently serves, nor how many distinct assets a
    -- cell currently holds: only blocks a duplicate *current* row for the pair.
    CREATE UNIQUE INDEX UQ_asset_cell_assignment_current
        ON produccion.asset_cell_assignment (asset_id, cell_id)
        WHERE valid_to IS NULL;
END
GO

-- ---------------------------------------------------------------------------
-- maint.asset += asset_category. Additive column with a DEFAULT: existing rows
-- (zero today -- catalog is empty in EBI_dev, verified 2026-07-03) backfill to
-- 'production_equipment' in the same DDL statement. Data-entry note: loaders
-- must set asset_category explicitly for material-handling equipment; the
-- silent default only suits manufacturing machinery.
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'maint.asset', N'asset_category') IS NULL
BEGIN
    ALTER TABLE maint.asset
        ADD asset_category NVARCHAR(20) NOT NULL
            CONSTRAINT DF_asset_asset_category DEFAULT (N'production_equipment')
            CONSTRAINT CK_asset_asset_category CHECK (asset_category IN (N'production_equipment', N'material_handling'));
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_asset_category' AND object_id = OBJECT_ID(N'maint.asset'))
    CREATE INDEX IX_asset_category ON maint.asset (asset_category);
GO

-- ---------------------------------------------------------------------------
-- Nav: 'production' section, dark-launched (is_active = 0), same pattern as
-- V7 ('maintenance') + V9 (item backfill). Section + items seeded together:
-- the module's routes ship alongside this migration.
-- Icon note: section uses 'Factory' (curated). Item icons 'Layers' and
-- 'LayoutGrid' are added to the curated NavIcon map
-- (src/modules/navigation/icons.tsx) by this plan's build step.
-- ---------------------------------------------------------------------------
MERGE auth.nav_section AS tgt
USING (VALUES
    (N'production', N'Producción', N'Factory', N'/production', 30, 0)
) AS src (code, label, icon, base_path, sort_order, is_active)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, label, icon, base_path, sort_order, is_active)
    VALUES (src.code, src.label, src.icon, src.base_path, src.sort_order, src.is_active);
GO

INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Líneas', N'Layers', N'/production/lines', 10
FROM auth.nav_section s
WHERE s.code = N'production'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item i
                  WHERE i.section_id = s.section_id AND i.href = N'/production/lines');
GO

INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Celdas', N'LayoutGrid', N'/production/cells', 20
FROM auth.nav_section s
WHERE s.code = N'production'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item i
                  WHERE i.section_id = s.section_id AND i.href = N'/production/cells');
GO

-- ---------------------------------------------------------------------------
-- RBAC: 'production.*' permissions, same pattern as V8. Matched by code.
-- No role_permission seeds: admin bypasses at app layer (ADR 0004).
-- ---------------------------------------------------------------------------
MERGE auth.permission AS tgt
USING (VALUES
    (N'production.line:create',       N'Create production lines'),
    (N'production.line:update',       N'Edit production lines'),
    (N'production.cell:create',       N'Create production cells'),
    (N'production.cell:update',       N'Edit production cells'),
    (N'production.assignment:create', N'Assign an asset to a production cell'),
    (N'production.assignment:close',  N'Close (end) an asset-cell assignment')
) AS src (code, description)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, description) VALUES (src.code, src.description);
GO

-- ---------------------------------------------------------------------------
-- Grants (least privilege) — guarded, same pattern as V5/V6.
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::produccion TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::produccion TO ebi_agent_ro');
GO
