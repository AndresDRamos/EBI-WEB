-- V2__schemas_staging_core.sql
-- Medallion schemas for the Planning module + ETL (Milestone 2).
--   staging : faithful EPS landing (only the ETL writes here)
--   core    : transformed data consumed by the portal and Power BI
--   etl     : control/auditing (run log, watermarks)

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF SCHEMA_ID(N'staging') IS NULL EXEC(N'CREATE SCHEMA staging');
GO
IF SCHEMA_ID(N'core') IS NULL EXEC(N'CREATE SCHEMA core');
GO
IF SCHEMA_ID(N'etl') IS NULL EXEC(N'CREATE SCHEMA etl');
GO

-- ETL run log + per-entity watermark for incremental, idempotent loads
IF OBJECT_ID(N'etl.run_log', N'U') IS NULL
BEGIN
    CREATE TABLE etl.run_log
    (
        run_id        BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_etl_run_log PRIMARY KEY,
        entity        NVARCHAR(128) NOT NULL,   -- source entity / mapping name
        started_at    DATETIME2(0) NOT NULL CONSTRAINT DF_etl_started DEFAULT (SYSUTCDATETIME()),
        finished_at   DATETIME2(0) NULL,
        status        NVARCHAR(20)  NOT NULL CONSTRAINT DF_etl_status DEFAULT (N'running'), -- running|success|failed
        rows_loaded   INT NULL,
        watermark     NVARCHAR(64) NULL,        -- last processed watermark (date/rowversion)
        message       NVARCHAR(2000) NULL
    );

    CREATE INDEX IX_etl_run_log_entity ON etl.run_log (entity, started_at DESC);
END
GO
