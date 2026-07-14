/* ============================================================================
   EPS — read-only login for the laser-cut sequencing ETL (EBI)
   ----------------------------------------------------------------------------
   Run on EPS SQL Server (192.168.4.5) as sysadmin. READ-ONLY: grants SELECT
   only, and only on the 8 tables the ETL reads (least privilege). Additive —
   never writes EPS data (hard rule #3).

   This is the EPS-SIDE (source) login, distinct from `ebi_etl` on the EBI
   Azure SQL side (created/granted by migration V20). Maps to the ETL's
   EPS_SQL_* env vars — see etl/README.md. Replace the password before running;
   it lives only in `.env` (EPS_SQL_PASSWORD), never in the repo.
   ============================================================================ */

-- 1) Server-level LOGIN (SQL authentication; tedious uses "default" auth)
USE [master];
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'ebi_etl_ro')
BEGIN
    CREATE LOGIN [ebi_etl_ro]
        WITH PASSWORD        = N'<PON-UN-PASSWORD-FUERTE-AQUI>',
             DEFAULT_DATABASE = [EPS],
             CHECK_POLICY     = ON,   -- honor the server password policy
             CHECK_EXPIRATION = OFF;  -- service account: does not expire
END
GO

-- 2) Database USER inside EPS
USE [EPS];
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'ebi_etl_ro')
    CREATE USER [ebi_etl_ro] FOR LOGIN [ebi_etl_ro];
GO

-- 3) SELECT grants — ONLY the 8 tables the ETL reads (table-level, least
--    privilege; intentionally NOT db_datareader).
--    dbo.*                                       PLANEACION.*
GRANT SELECT ON OBJECT::dbo.tblNesteo             TO [ebi_etl_ro];
GRANT SELECT ON OBJECT::dbo.tblNesteoDetail       TO [ebi_etl_ro];
GRANT SELECT ON OBJECT::dbo.tblNesteoPlan         TO [ebi_etl_ro];
GRANT SELECT ON OBJECT::dbo.tblMaterial           TO [ebi_etl_ro];
GRANT SELECT ON OBJECT::dbo.tblMaterialRutaTiempo TO [ebi_etl_ro];
GRANT SELECT ON OBJECT::dbo.tblRuta               TO [ebi_etl_ro];
GRANT SELECT ON OBJECT::dbo.tblProceso            TO [ebi_etl_ro];
GRANT SELECT ON OBJECT::PLANEACION.tblEstacionRuta TO [ebi_etl_ro];
GO

-- 4) (Optional) Verify — run these RECONNECTED as ebi_etl_ro:
--      SELECT COUNT(*) FROM EPS.dbo.tblNesteo WHERE idPlanta = 1 AND idRuta = 9;
--        -> ~294 (open window). An INSERT/UPDATE must fail with a permission error.
