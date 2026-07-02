-- V5__maint_asset_catalog.sql
-- Mantenimiento module (CMMS), part 1 of 2: `maint` schema + asset catalog.
-- Tables: process, asset (self-referencing hierarchy), asset_process (M:N),
-- asset_restriction, asset_document (metadata only; file bytes live in Azure
-- Blob Storage, referenced by blob_path).
-- Enumerations are enforced with named CHECK constraints (no lookup tables;
-- see plan 0004 rationale). All rows soft-delete via is_active; FKs to
-- catalogs use NO ACTION, child/junction rows cascade from their parent.
-- updated_at is app-maintained (no triggers), consistent with dbo/auth.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
IF SCHEMA_ID(N'maint') IS NULL EXEC(N'CREATE SCHEMA maint');
GO

-- ---------------------------------------------------------------------------
-- maint.process — manufacturing process catalog (stamping, welding, ...)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.process', N'U') IS NULL
BEGIN
    CREATE TABLE maint.process
    (
        process_id  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_process PRIMARY KEY,
        code        NVARCHAR(32)  NOT NULL,
        name        NVARCHAR(160) NOT NULL,
        description NVARCHAR(512) NULL,
        is_active   BIT NOT NULL CONSTRAINT DF_process_active DEFAULT (1),
        created_at  DATETIME2(0) NOT NULL CONSTRAINT DF_process_created DEFAULT (SYSUTCDATETIME()),
        updated_at  DATETIME2(0) NOT NULL CONSTRAINT DF_process_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_process_code UNIQUE (code)
    );
END
GO

-- ---------------------------------------------------------------------------
-- maint.asset — machine/equipment catalog. `code` is the internal tag (QR).
-- parent_asset_id models sub-assemblies (one level or more; app decides depth).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset
    (
        asset_id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset PRIMARY KEY,
        code             NVARCHAR(32)  NOT NULL,          -- internal tag, QR payload
        name             NVARCHAR(200) NOT NULL,
        brand            NVARCHAR(120) NULL,
        model            NVARCHAR(120) NULL,
        serial_number    NVARCHAR(120) NULL,
        plant_id         INT NOT NULL,
        location         NVARCHAR(160) NULL,              -- free-text area/cell (v1)
        criticality      CHAR(1) NOT NULL CONSTRAINT DF_asset_criticality DEFAULT ('C'),
        status           NVARCHAR(20) NOT NULL CONSTRAINT DF_asset_status DEFAULT (N'active'),
        parent_asset_id  INT NULL,                        -- self-FK: sub-assembly of
        acquisition_date DATE NULL,
        notes            NVARCHAR(2000) NULL,
        is_active        BIT NOT NULL CONSTRAINT DF_asset_active DEFAULT (1),
        created_at       DATETIME2(0) NOT NULL CONSTRAINT DF_asset_created DEFAULT (SYSUTCDATETIME()),
        updated_at       DATETIME2(0) NOT NULL CONSTRAINT DF_asset_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_asset_code UNIQUE (code),
        CONSTRAINT CK_asset_criticality CHECK (criticality IN ('A', 'B', 'C')),
        CONSTRAINT CK_asset_status CHECK (status IN (N'active', N'in_repair', N'standby', N'retired')),
        CONSTRAINT CK_asset_not_own_parent CHECK (parent_asset_id IS NULL OR parent_asset_id <> asset_id),
        CONSTRAINT FK_asset_plant FOREIGN KEY (plant_id)
            REFERENCES auth.plant (plant_id),             -- no cascade: protect catalog rows
        CONSTRAINT FK_asset_parent FOREIGN KEY (parent_asset_id)
            REFERENCES maint.asset (asset_id)             -- no cascade (self-FK cannot cascade in MSSQL)
    );

    CREATE INDEX IX_asset_plant  ON maint.asset (plant_id, is_active);
    CREATE INDEX IX_asset_parent ON maint.asset (parent_asset_id) WHERE parent_asset_id IS NOT NULL;
END
GO

-- ---------------------------------------------------------------------------
-- maint.asset_process — M:N asset <-> process (multi-process machines, storage)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_process', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset_process
    (
        asset_id   INT NOT NULL,
        process_id INT NOT NULL,
        CONSTRAINT PK_asset_process PRIMARY KEY (asset_id, process_id),
        CONSTRAINT FK_asset_process_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id) ON DELETE CASCADE,
        CONSTRAINT FK_asset_process_process FOREIGN KEY (process_id)
            REFERENCES maint.process (process_id)         -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_asset_process_process ON maint.asset_process (process_id);
END
GO

-- ---------------------------------------------------------------------------
-- maint.asset_restriction — operational/safety limitations per asset
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_restriction', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset_restriction
    (
        restriction_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_restriction PRIMARY KEY,
        asset_id         INT NOT NULL,
        restriction_type NVARCHAR(20) NOT NULL,
        description      NVARCHAR(MAX) NOT NULL,
        is_active        BIT NOT NULL CONSTRAINT DF_asset_restriction_active DEFAULT (1),
        created_at       DATETIME2(0) NOT NULL CONSTRAINT DF_asset_restriction_created DEFAULT (SYSUTCDATETIME()),
        updated_at       DATETIME2(0) NOT NULL CONSTRAINT DF_asset_restriction_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_asset_restriction_type
            CHECK (restriction_type IN (N'limitation', N'safety', N'operational')),
        CONSTRAINT FK_asset_restriction_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id) ON DELETE CASCADE
    );

    CREATE INDEX IX_asset_restriction_asset ON maint.asset_restriction (asset_id);
END
GO

-- ---------------------------------------------------------------------------
-- maint.asset_document — document metadata; bytes live in Azure Blob Storage.
-- Referenced later by maint.plan_task (visual aids) -> NO cascade from asset:
-- documents are removed explicitly by the app (soft-delete via is_active).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'maint.asset_document', N'U') IS NULL
BEGIN
    CREATE TABLE maint.asset_document
    (
        document_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_document PRIMARY KEY,
        asset_id        INT NOT NULL,
        doc_type        NVARCHAR(24) NOT NULL,
        title           NVARCHAR(200) NOT NULL,
        blob_path       NVARCHAR(400) NOT NULL,           -- Azure Blob Storage key (container-relative)
        content_type    NVARCHAR(120) NULL,               -- MIME type
        file_size_bytes BIGINT NULL,
        version         INT NOT NULL CONSTRAINT DF_asset_document_version DEFAULT (1),
        is_active       BIT NOT NULL CONSTRAINT DF_asset_document_active DEFAULT (1),
        uploaded_by     INT NOT NULL,
        uploaded_at     DATETIME2(0) NOT NULL CONSTRAINT DF_asset_document_uploaded DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_asset_document_type CHECK (doc_type IN
            (N'manual', N'electrical_diagram', N'pneumatic_diagram', N'dxf_topview', N'photo', N'other')),
        CONSTRAINT CK_asset_document_size CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
        CONSTRAINT FK_asset_document_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id),            -- no cascade: plan_task may reference this row
        CONSTRAINT FK_asset_document_uploaded_by FOREIGN KEY (uploaded_by)
            REFERENCES auth.app_user (user_id)            -- no cascade: preserve authorship history
    );

    CREATE INDEX IX_asset_document_asset ON maint.asset_document (asset_id, doc_type);
END
GO

-- ---------------------------------------------------------------------------
-- Grants (least privilege) — guarded, same pattern as V3
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::maint TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::maint TO ebi_agent_ro');
GO
