-- V18__org_locations_type_processes.sql
-- *** ADOPTED-FROM-LIVE RECONSTRUCTION *** This migration was already applied to
-- EBI_dev on 2026-07-08 by a session that died before committing the file. The SQL
-- below was rebuilt from live-schema introspection (ebi-sql-dev) + the V17 baseline
-- so the repo matches reality; after adopting it, run `flyway repair` to realign
-- the checksum. Do NOT re-apply to EBI_dev. Prod EBI has NOT run it yet.
--
-- What it does (plan machines-locations-view):
--   org.location            (NEW)  named locations within a plant (plant_id, code UQ per plant)
--   maint.asset_type_process(NEW)  M:N type<->process, REPLACES maint.asset_process
--                                  (process capability now lives on the TYPE, not the asset)
--   maint.asset_type         +code_prefix NOT NULL UNIQUE (matricula prefix moves here)
--   maint.asset_category     -code_prefix (+ its UNIQUE): prefix no longer a category concern
--   maint.asset_code_sequence re-keyed (asset_category_id,plant_id)->(asset_type_id,plant_id)
--   maint.asset              -plant_id (plant now derived via location) +location_id NOT NULL
--   production.cell          +location_id NULL (a cell may sit inside a location)
-- PREREQUISITE (destructive, dev-only data): all maint.asset rows and their
-- dependents are purged up front -- the NOT NULL adds and the sequence re-key
-- require empty tables. Prod EBI has zero asset rows, so the purge is a no-op there.
-- FKs use NO ACTION (protect catalog rows); updated_at is app-maintained (no triggers).
-- Seeds 3 auth.permission codes for org.location (same MERGE pattern as V8/V15/V17);
-- no role_permission rows, no nav items. Target: Azure SQL. ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- 0) Data purge (IRREVERSIBLE). Delete FK dependents first, then assets
--    (self-FK FK_asset_parent forces nulling parent_asset_id before the delete),
--    then the sequence rows (the re-key below needs the table empty).
--    asset_process rows die here too; the table itself is dropped in step 4.
-- ---------------------------------------------------------------------------
DELETE FROM production.asset_placement;
DELETE FROM production.asset_footprint;
DELETE FROM production.asset_cell_assignment;
DELETE FROM maint.asset_document;
DELETE FROM maint.asset_restriction;
DELETE FROM maint.asset_process;
UPDATE maint.asset SET parent_asset_id = NULL WHERE parent_asset_id IS NOT NULL;
DELETE FROM maint.asset;
DELETE FROM maint.asset_code_sequence;
GO

-- ---------------------------------------------------------------------------
-- 1) org.location — named locations WITHIN a plant (e.g. 'Nave 2', 'Almacén MP').
--    code is unique per plant; the composite UNIQUE doubles as the FK-support
--    index for plant_id (leading column), same pattern as UQ_asset_type_category_code.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'org.location', N'U') IS NULL
BEGIN
    CREATE TABLE org.location
    (
        location_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_location PRIMARY KEY,
        plant_id    INT NOT NULL,
        code        NVARCHAR(32)  NOT NULL,
        name        NVARCHAR(160) NOT NULL,
        is_active   BIT NOT NULL CONSTRAINT DF_location_active DEFAULT (1),
        created_at  DATETIME2(0) NOT NULL CONSTRAINT DF_location_created DEFAULT (SYSUTCDATETIME()),
        updated_at  DATETIME2(0) NOT NULL CONSTRAINT DF_location_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_location_plant_code UNIQUE (plant_id, code),
        CONSTRAINT FK_location_plant FOREIGN KEY (plant_id)
            REFERENCES org.plant (plant_id)              -- no cascade: protect catalog rows
    );
END
GO

-- ---------------------------------------------------------------------------
-- 2) maint.asset_type: the matricula prefix moves category -> type.
--    Backfill from the owning category BEFORE the NOT NULL flip so existing type
--    rows survive (1 row in dev at apply time). NOTE: if two types shared a
--    category this backfill would collide on UQ_asset_type_prefix -- true at
--    apply time (1 type), guaranteed-safe only on empty/1:1 data.
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'maint.asset_type', N'code_prefix') IS NULL
BEGIN
    ALTER TABLE maint.asset_type ADD code_prefix NVARCHAR(8) NULL;
END
GO
UPDATE t
SET t.code_prefix = c.code_prefix
FROM maint.asset_type AS t
JOIN maint.asset_category AS c ON c.asset_category_id = t.asset_category_id
WHERE t.code_prefix IS NULL;
GO
ALTER TABLE maint.asset_type ALTER COLUMN code_prefix NVARCHAR(8) NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints
               WHERE name = N'UQ_asset_type_prefix'
                 AND parent_object_id = OBJECT_ID(N'maint.asset_type'))
    ALTER TABLE maint.asset_type ADD CONSTRAINT UQ_asset_type_prefix UNIQUE (code_prefix);
GO

-- ---------------------------------------------------------------------------
-- 3) maint.asset_category: drop code_prefix (+ its UNIQUE, V17). IRREVERSIBLE:
--    the value now lives on asset_type (backfilled above); the category copy is
--    discarded.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.UQ_asset_category_prefix', N'UQ') IS NOT NULL
    ALTER TABLE maint.asset_category DROP CONSTRAINT UQ_asset_category_prefix;
GO
IF COL_LENGTH(N'maint.asset_category', N'code_prefix') IS NOT NULL
    ALTER TABLE maint.asset_category DROP COLUMN code_prefix;
GO

-- ---------------------------------------------------------------------------
-- 4) maint.asset_type_process — M:N type <-> process, REPLACES maint.asset_process
--    (V5): "which processes can this TYPE of machine run" is a property of the
--    type, not of each unit. No data migration: asset_process rows were purged
--    with their assets in step 0 (table starts empty; the user re-links per type).
--    Same link-row shape + reverse-lookup index pattern as V5/V15.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_type_process', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset_type_process
    (
        asset_type_id INT NOT NULL,
        process_id    INT NOT NULL,
        CONSTRAINT PK_asset_type_process PRIMARY KEY (asset_type_id, process_id),
        CONSTRAINT FK_asset_type_process_type FOREIGN KEY (asset_type_id)
            REFERENCES maint.asset_type (asset_type_id),  -- no cascade: protect catalog rows
        CONSTRAINT FK_asset_type_process_process FOREIGN KEY (process_id)
            REFERENCES org.process (process_id)           -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_asset_type_process_process ON maint.asset_type_process (process_id);
END
GO
IF OBJECT_ID(N'maint.asset_process', N'U') IS NOT NULL
    DROP TABLE maint.asset_process;                       -- IRREVERSIBLE (rows already purged)
GO

-- ---------------------------------------------------------------------------
-- 5) maint.asset_code_sequence — re-key (asset_category_id, plant_id) ->
--    (asset_type_id, plant_id): the matricula counter follows the prefix, which
--    now lives on the type. Table is empty (step 0), so drop + recreate is the
--    cleanest way to get the new PK; kept constraint names are identical to V17.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_code_sequence', N'U') IS NOT NULL
    DROP TABLE maint.asset_code_sequence;
GO
CREATE TABLE maint.asset_code_sequence
(
    asset_type_id INT NOT NULL,
    plant_id      INT NOT NULL,
    next_seq      INT NOT NULL CONSTRAINT DF_asset_code_sequence_next DEFAULT (1),
    CONSTRAINT PK_asset_code_sequence PRIMARY KEY (asset_type_id, plant_id),
    CONSTRAINT CK_asset_code_sequence_next CHECK (next_seq >= 1),
    CONSTRAINT FK_asset_code_sequence_type FOREIGN KEY (asset_type_id)
        REFERENCES maint.asset_type (asset_type_id),      -- no cascade
    CONSTRAINT FK_asset_code_sequence_plant FOREIGN KEY (plant_id)
        REFERENCES org.plant (plant_id)                   -- no cascade
);
GO

-- ---------------------------------------------------------------------------
-- 6) maint.asset: plant_id -> location_id. IRREVERSIBLE: the direct plant link
--    is discarded; plant is now DERIVED via location.plant_id. Table is empty
--    (step 0), so the NOT NULL add is clean. Drop order: index -> FK -> column.
-- ---------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_asset_plant' AND object_id = OBJECT_ID(N'maint.asset'))
    DROP INDEX IX_asset_plant ON maint.asset;
GO
IF OBJECT_ID(N'maint.FK_asset_plant', N'F') IS NOT NULL
    ALTER TABLE maint.asset DROP CONSTRAINT FK_asset_plant;
GO
IF COL_LENGTH(N'maint.asset', N'plant_id') IS NOT NULL
    ALTER TABLE maint.asset DROP COLUMN plant_id;
GO
IF COL_LENGTH(N'maint.asset', N'location_id') IS NULL
    ALTER TABLE maint.asset ADD location_id INT NOT NULL;
GO
IF OBJECT_ID(N'maint.FK_asset_location', N'F') IS NULL
    ALTER TABLE maint.asset ADD CONSTRAINT FK_asset_location FOREIGN KEY (location_id)
        REFERENCES org.location (location_id);            -- no cascade
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_asset_location' AND object_id = OBJECT_ID(N'maint.asset'))
    CREATE INDEX IX_asset_location ON maint.asset (location_id, is_active);
GO

-- ---------------------------------------------------------------------------
-- 7) production.cell: optional link to a location (a cell may sit inside a
--    named location). NULLable -- existing 4 cells stay NULL; filtered index
--    only pays for linked rows (same pattern as IX_asset_parent, V5).
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'production.cell', N'location_id') IS NULL
    ALTER TABLE production.cell ADD location_id INT NULL;
GO
IF OBJECT_ID(N'production.FK_cell_location', N'F') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT FK_cell_location FOREIGN KEY (location_id)
        REFERENCES org.location (location_id);            -- no cascade
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cell_location' AND object_id = OBJECT_ID(N'production.cell'))
    CREATE INDEX IX_cell_location ON production.cell (location_id) WHERE location_id IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 8) auth.permission — seeds for the org.location catalog. Same idempotent MERGE
--    pattern as V8/V15/V17. No role_permission seeds (admin bypasses at the app
--    layer); no nav-item seed (location admin lives inside existing admin pages).
-- ---------------------------------------------------------------------------
MERGE auth.permission AS tgt
USING (VALUES
    (N'org.location:create', N'Create plant locations'),
    (N'org.location:update', N'Edit plant locations'),
    (N'org.location:delete', N'Delete plant locations')
) AS src (code, description)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, description) VALUES (src.code, src.description);
GO

-- ---------------------------------------------------------------------------
-- Grants. org.location / maint.asset_type_process / the recreated sequence table
-- are covered by the SCHEMA-scoped grants from V15 (org) and V5 (maint) -- no new
-- grants strictly required. Re-issued idempotently as belt-and-suspenders (V17
-- precedent).
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::org TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::org TO ebi_agent_ro');
GO
