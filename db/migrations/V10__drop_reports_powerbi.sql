-- V10__drop_reports_powerbi.sql
-- Power BI purge cleanup (plan 0007-portal-home-nav-authz). Plan 0007 removed all
-- Power BI code (routes, module db, admin/report UI); this migration retires the
-- now-orphaned schema that outlived it:
--   dbo.report, dbo.report_category -> report catalog tables (both empty, verified
--                                      against EBI_dev 2026-07-03; no rows to lose).
--                                      Only FK involving them is FK_report_category
--                                      (dbo.report.category_id -> dbo.report_category);
--                                      no other table references either (sweep of
--                                      sys.foreign_keys.referenced_object_id).
--   auth.permission 'reports.%'     -> 6 inert permission codes seeded by V8
--                                      (reports.report:{create,update,delete},
--                                      reports.category:{create,update,delete}),
--                                      all with 0 rows in auth.role_permission.
-- Deleted by CODE, not id (ids are not contract, per V8's house pattern). V8 defines
-- FK_role_permission_permission ON DELETE CASCADE, so grants would die with their
-- permission anyway; the guarded role_permission DELETE below is defensive belt-and-
-- suspenders (no-op given 0 grants) in case the FK is ever redefined NO ACTION.
-- This is CLEANUP, not a decision: real Power BI (reports + categories, likely
-- reshaped) will be re-planned and re-migrated when the feature is actually built.
-- Nothing here re-seeds; a future migration owns the new shape.
-- Irreversible: DROP TABLE cannot be rolled back even on empty tables (the object
-- definition is gone); permission DELETEs are re-seedable but not auto-reverted.
-- Idempotent guards for safe dev re-runs.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- 1. Retire the inert 'reports.%' permission codes. Defensive role_permission
--    DELETE first (no-op under V8's ON DELETE CASCADE + 0 grants; the safety net
--    if the FK is ever NO ACTION), then the permissions themselves. Matched by
--    code -- ids are not contract.
-- ---------------------------------------------------------------------------
DELETE rp
FROM auth.role_permission rp
INNER JOIN auth.permission p ON p.permission_id = rp.permission_id
WHERE p.code LIKE N'reports.%';
GO

DELETE FROM auth.permission
WHERE code LIKE N'reports.%';
GO

-- ---------------------------------------------------------------------------
-- 2. Drop the orphaned report catalog. Drop the child (dbo.report) first: that
--    removes FK_report_category with it, then the parent (dbo.report_category)
--    drops cleanly. Both guarded by IF OBJECT_ID for safe re-runs.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.report', N'U') IS NOT NULL
    DROP TABLE dbo.report;              -- carries FK_report_category away with it
GO

IF OBJECT_ID(N'dbo.report_category', N'U') IS NOT NULL
    DROP TABLE dbo.report_category;
GO
