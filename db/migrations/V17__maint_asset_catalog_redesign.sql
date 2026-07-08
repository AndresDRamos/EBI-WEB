-- V17__maint_asset_catalog_redesign.sql
-- Redesign of the maintenance asset catalog (plan equipment-maintenance-attributes),
-- schema half. Promotes asset_category from a CHECK to a configurable catalog and
-- introduces a category->type hierarchy; the asset's category is DERIVED via its type.
--   maint.asset_category  -> configurable, carries the matricula code_prefix
--   maint.asset_type      -> machine types grouped under a category (code unique per category)
--   maint.asset_code_sequence -> race-safe per (category, plant) counter for the matricula
-- maint.asset changes: + asset_type_id (NOT NULL FK), + image_blob_path,
--   acquisition_date -> installation_date (rename), DROP asset_category (+CHECK+index),
--   DROP location. `code` stays NVARCHAR(32) UNIQUE but is now app-generated.
-- Enumerations that remain fixed (criticality, status) stay as named CHECK constraints.
-- FKs use NO ACTION (protect catalog rows); updated_at is app-maintained (no triggers).
-- Also seeds 6 auth.permission codes for the two new catalogs (same MERGE pattern as
--   V8; codes lowercase '<module>.<resource>:<action>', CK_permission_code_format applies).
--   No role_permission seeds (admin bypasses at the app layer, as in V8). No nav-item seed:
--   catalog admin is a tab inside /maintenance/machines, not a new nav item.
-- PREREQUISITE (dev only): the 6 test assets in maint.asset must be purged BEFORE this
-- migration -- the ADD asset_type_id NOT NULL requires an empty table. Prod EBI has zero
-- asset rows, so it applies directly. Target: Azure SQL. ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- maint.asset_category -- configurable, replaces the V11 CHECK. code_prefix
-- builds the asset matricula (PRD-P1-0001); it is UNIQUE so two categories can
-- never collide on the same prefix within a plant.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_category', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset_category
    (
        asset_category_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_category PRIMARY KEY,
        code        NVARCHAR(40)  NOT NULL,          -- stable machine key
        name        NVARCHAR(120) NOT NULL,          -- Spanish UI label
        code_prefix NVARCHAR(8)   NOT NULL,          -- matricula prefix, e.g. 'PRD'
        is_active   BIT NOT NULL CONSTRAINT DF_asset_category_active DEFAULT (1),
        created_at  DATETIME2(0) NOT NULL CONSTRAINT DF_asset_category_created DEFAULT (SYSUTCDATETIME()),
        updated_at  DATETIME2(0) NOT NULL CONSTRAINT DF_asset_category_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_asset_category_code   UNIQUE (code),
        CONSTRAINT UQ_asset_category_prefix UNIQUE (code_prefix)
    );
END
GO

-- Seed the two values migrated from the V11 CHECK. Idempotent (matched by code).
MERGE maint.asset_category AS tgt
USING (VALUES
    (N'production_equipment', N'Equipo de producción', N'PRD'),
    (N'material_handling',    N'Manejo de materiales', N'MMH')
) AS src (code, name, code_prefix)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, name, code_prefix) VALUES (src.code, src.name, src.code_prefix);
GO

-- ---------------------------------------------------------------------------
-- maint.asset_type -- machine types grouped UNDER a category (category->type).
-- code is unique WITHIN a category; the composite unique index doubles as the
-- FK-support index for asset_category_id. No seed: the user creates types.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_type', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset_type
    (
        asset_type_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_type PRIMARY KEY,
        asset_category_id INT NOT NULL,
        code       NVARCHAR(40)  NOT NULL,
        name       NVARCHAR(120) NOT NULL,
        is_active  BIT NOT NULL CONSTRAINT DF_asset_type_active DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_asset_type_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_asset_type_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_asset_type_category_code UNIQUE (asset_category_id, code),
        CONSTRAINT FK_asset_type_category FOREIGN KEY (asset_category_id)
            REFERENCES maint.asset_category (asset_category_id)   -- no cascade: protect catalog rows
    );
END
GO

-- ---------------------------------------------------------------------------
-- maint.asset_code_sequence -- race-safe per (category, plant) counter that
-- backs the matricula. next_seq is the NEXT value to hand out. The app locks
-- and increments this row inside the asset-insert transaction (see plan for the
-- exact SERIALIZABLE/UPDLOCK algorithm). No triggers, no DB default on the code.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_code_sequence', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset_code_sequence
    (
        asset_category_id INT NOT NULL,
        plant_id          INT NOT NULL,
        next_seq          INT NOT NULL CONSTRAINT DF_asset_code_sequence_next DEFAULT (1),
        CONSTRAINT PK_asset_code_sequence PRIMARY KEY (asset_category_id, plant_id),
        CONSTRAINT CK_asset_code_sequence_next CHECK (next_seq >= 1),
        CONSTRAINT FK_asset_code_sequence_category FOREIGN KEY (asset_category_id)
            REFERENCES maint.asset_category (asset_category_id), -- no cascade
        CONSTRAINT FK_asset_code_sequence_plant FOREIGN KEY (plant_id)
            REFERENCES org.plant (plant_id)                      -- no cascade
    );
END
GO

-- ---------------------------------------------------------------------------
-- maint.asset -- column changes.
-- ---------------------------------------------------------------------------

-- (a) DROP the old asset_category dimension (index -> default -> check -> column).
--     IRREVERSIBLE: the category enum is now carried by maint.asset_category and
--     derived through asset_type. Any value in this column is discarded.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_asset_category' AND object_id = OBJECT_ID(N'maint.asset'))
    DROP INDEX IX_asset_category ON maint.asset;
GO
IF OBJECT_ID(N'maint.DF_asset_asset_category', N'D') IS NOT NULL
    ALTER TABLE maint.asset DROP CONSTRAINT DF_asset_asset_category;
GO
IF OBJECT_ID(N'maint.CK_asset_asset_category', N'C') IS NOT NULL
    ALTER TABLE maint.asset DROP CONSTRAINT CK_asset_asset_category;
GO
IF COL_LENGTH(N'maint.asset', N'asset_category') IS NOT NULL
    ALTER TABLE maint.asset DROP COLUMN asset_category;
GO

-- (b) DROP free-text location. IRREVERSIBLE: physical location is now sourced
--     from production.asset_cell_assignment -> cell. Any text here is discarded.
IF COL_LENGTH(N'maint.asset', N'location') IS NOT NULL
    ALTER TABLE maint.asset DROP COLUMN location;
GO

-- (c) Rename acquisition_date -> installation_date (stays DATE; app stores day=01
--     for approximate month/year). Empty table -> sp_rename is clean (the column
--     has no default/check/index to update).
IF COL_LENGTH(N'maint.asset', N'acquisition_date') IS NOT NULL
   AND COL_LENGTH(N'maint.asset', N'installation_date') IS NULL
    EXEC sp_rename N'maint.asset.acquisition_date', N'installation_date', N'COLUMN';
GO

-- (d) Add image_blob_path (single primary photo; Azure Blob container 'maintenance').
IF COL_LENGTH(N'maint.asset', N'image_blob_path') IS NULL
    ALTER TABLE maint.asset ADD image_blob_path NVARCHAR(400) NULL;
GO

-- (e) Add asset_type_id NOT NULL. Requires an EMPTY table (prod is empty; dev must
--     be purged first). Category is derived via type -> NO asset_category_id on asset.
IF COL_LENGTH(N'maint.asset', N'asset_type_id') IS NULL
    ALTER TABLE maint.asset ADD asset_type_id INT NOT NULL;
GO
IF OBJECT_ID(N'maint.FK_asset_type', N'F') IS NULL
    ALTER TABLE maint.asset ADD CONSTRAINT FK_asset_type FOREIGN KEY (asset_type_id)
        REFERENCES maint.asset_type (asset_type_id);            -- no cascade
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_asset_type' AND object_id = OBJECT_ID(N'maint.asset'))
    CREATE INDEX IX_asset_type ON maint.asset (asset_type_id);
GO

-- ---------------------------------------------------------------------------
-- auth.permission — seeds for the two new configurable catalogs. Same idempotent
-- MERGE pattern as V8 (matched by code; CK_permission_code_format enforces the
-- lowercase '<module>.<resource>:<action>' shape). No role_permission seeds: the
-- only current user is admin (app-layer bypass), so an empty grant table preserves
-- effective access exactly, as in V8. No nav-item seed: catalog admin is a tab
-- inside /maintenance/machines, not a new sidebar item.
-- ---------------------------------------------------------------------------
MERGE auth.permission AS tgt
USING (VALUES
    (N'maintenance.asset_category:create', N'Create asset categories'),
    (N'maintenance.asset_category:update', N'Edit asset categories'),
    (N'maintenance.asset_category:delete', N'Delete asset categories'),
    (N'maintenance.asset_type:create',     N'Create asset types'),
    (N'maintenance.asset_type:update',     N'Edit asset types'),
    (N'maintenance.asset_type:delete',     N'Delete asset types')
) AS src (code, description)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, description) VALUES (src.code, src.description);
GO

-- ---------------------------------------------------------------------------
-- Grants. The three new tables are in schema maint; the SCHEMA::maint grants
-- from V5 (ebi_app CRUD, ebi_agent_ro SELECT) already cover them -- no new
-- grants are strictly required (same as V13 over V11's schema grants). The
-- permission seed above targets auth.permission, already covered by V3's
-- SCHEMA::auth grants. Re-issued here idempotently as belt-and-suspenders.
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::maint TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::maint TO ebi_agent_ro');
GO
