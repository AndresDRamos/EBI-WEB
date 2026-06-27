-- V4__user_admin_catalog_columns.sql
-- User-administration module (plan 0003-admin-panel-restructure):
-- descriptive/state columns for the auth catalogs.
--   auth.role       += is_active   (deactivate non-system roles; only `admin`
--                                   is protected, enforced at the app layer)
--   auth.department += description
--   auth.plant      += address, postal_code
-- All additions are non-breaking: new text columns are NULLable (no back-fill);
-- role.is_active is NOT NULL DEFAULT 1 so existing rows are filled with 1 by the
-- engine. No new indexes/constraints: these are descriptive attributes, not
-- filter/join keys. Idempotent guards (COL_LENGTH) keep dev re-runs safe.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- auth.role — is_active (inactivate non-system roles)
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'auth.role', N'is_active') IS NULL
BEGIN
    ALTER TABLE auth.role
        ADD is_active BIT NOT NULL
            CONSTRAINT DF_role_active DEFAULT (1);
END
GO

-- ---------------------------------------------------------------------------
-- auth.department — description
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'auth.department', N'description') IS NULL
BEGIN
    ALTER TABLE auth.department
        ADD description NVARCHAR(256) NULL;
END
GO

-- ---------------------------------------------------------------------------
-- auth.plant — address, postal_code
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'auth.plant', N'address') IS NULL
BEGIN
    ALTER TABLE auth.plant
        ADD address NVARCHAR(256) NULL;
END
GO

IF COL_LENGTH(N'auth.plant', N'postal_code') IS NULL
BEGIN
    ALTER TABLE auth.plant
        ADD postal_code NVARCHAR(16) NULL;
END
GO
