-- V12__rename_produccion_schema_to_production.sql
-- Corrects the one Spanish-named schema to the project's English DB naming
-- convention: `produccion` (V11) -> `production`. SQL Server cannot rename a
-- schema, so this is CREATE SCHEMA + ALTER SCHEMA ... TRANSFER per table +
-- re-grant + DROP of the old (now empty) schema.
-- TRANSFER is metadata-only: data, FKs (they bind by object_id, so transfer
-- order is irrelevant), CHECK constraints, defaults, indexes (including the
-- filtered unique ones) and statistics all move intact. Constraint/index names
-- carry no schema prefix (V11 convention), so no names change.
-- Schema-scoped permissions do NOT follow transferred objects: the V11 grants
-- on SCHEMA::produccion die with the old schema, so both are re-issued on
-- `production` (guarded, same pattern as V5/V6/V11).
-- Deploy coupling (outside this file): src/modules/production/db.ts binds
-- .withSchema("produccion") and must ship as "production" in the same release;
-- run `pnpm db:gen` after migrating to regenerate Kysely types.
-- Nav/permission seeds from V11 are already English ('production',
-- 'production.*') -- no data changes here.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- New schema
-- ---------------------------------------------------------------------------
IF SCHEMA_ID(N'production') IS NULL EXEC(N'CREATE SCHEMA production');
GO

-- ---------------------------------------------------------------------------
-- Transfers. Each guarded on the SOURCE object so a partially-applied run
-- (or a re-run) skips what already moved. Order is irrelevant: FKs survive
-- TRANSFER regardless of the order tables move in.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'produccion.production_line', N'U') IS NOT NULL
    ALTER SCHEMA production TRANSFER OBJECT::produccion.production_line;
GO

IF OBJECT_ID(N'produccion.cell', N'U') IS NOT NULL
    ALTER SCHEMA production TRANSFER OBJECT::produccion.cell;
GO

IF OBJECT_ID(N'produccion.asset_cell_assignment', N'U') IS NOT NULL
    ALTER SCHEMA production TRANSFER OBJECT::produccion.asset_cell_assignment;
GO

-- ---------------------------------------------------------------------------
-- Grants (least privilege) -- re-issued on the new schema. The old grants on
-- SCHEMA::produccion are destroyed with the schema below; nothing to revoke.
-- Guarded, same pattern as V5/V6/V11. GRANT is idempotent on re-runs.
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::production TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::production TO ebi_agent_ro');
GO

-- ---------------------------------------------------------------------------
-- Drop the old schema. Guarded on existence only, ON PURPOSE: if anything
-- unexpected still lives in `produccion` (an object this migration does not
-- know about), DROP SCHEMA fails with msg 3729 and the migration stops --
-- that failure is the correct outcome; do not work around it. On a clean
-- re-run the schema is already gone and this is skipped.
-- ---------------------------------------------------------------------------
IF SCHEMA_ID(N'produccion') IS NOT NULL
    DROP SCHEMA produccion;
GO
