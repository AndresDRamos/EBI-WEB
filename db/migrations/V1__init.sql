-- V1__init.sql
-- Report metadata for the Power BI admin module (Milestone 1).
-- Target: Azure SQL (EBI_dev / EBI). Idempotent guards for safe re-runs in dev.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Report categories (navigation grouping)
IF OBJECT_ID(N'dbo.report_category', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.report_category
    (
        category_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_report_category PRIMARY KEY,
        name        NVARCHAR(120) NOT NULL,
        sort_order  INT NOT NULL CONSTRAINT DF_report_category_sort DEFAULT (0),
        CONSTRAINT UQ_report_category_name UNIQUE (name)
    );
END
GO

-- Reports catalog (replaces the public "Publish to web" URLs)
IF OBJECT_ID(N'dbo.report', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.report
    (
        report_id      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_report PRIMARY KEY,
        name           NVARCHAR(200) NOT NULL,
        workspace_guid NVARCHAR(64)  NOT NULL,
        report_guid    NVARCHAR(64)  NOT NULL,
        dataset_guid   NVARCHAR(64)  NULL,
        category_id    INT           NULL,
        description    NVARCHAR(1000) NULL,
        sort_order     INT NOT NULL CONSTRAINT DF_report_sort DEFAULT (0),
        is_active      BIT NOT NULL CONSTRAINT DF_report_active DEFAULT (1),
        created_at     DATETIME2(0) NOT NULL CONSTRAINT DF_report_created DEFAULT (SYSUTCDATETIME()),
        updated_at     DATETIME2(0) NOT NULL CONSTRAINT DF_report_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_report_category FOREIGN KEY (category_id)
            REFERENCES dbo.report_category (category_id),
        CONSTRAINT UQ_report_guid UNIQUE (workspace_guid, report_guid)
    );

    CREATE INDEX IX_report_category ON dbo.report (category_id) WHERE category_id IS NOT NULL;
    CREATE INDEX IX_report_active   ON dbo.report (is_active);
END
GO
