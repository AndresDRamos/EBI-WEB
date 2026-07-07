-- V15__org_schema_plant_process.sql
-- Plan org-schema-plant-process: extracts ORGANIZATIONAL entities out of the
-- identity-focused `auth` schema (and unifies the process catalog out of
-- `maint`) into a new `org` schema.
--   auth.plant   -> org.plant     (ALTER SCHEMA TRANSFER)   canonical plant catalog
--   maint.process-> org.process   (ALTER SCHEMA TRANSFER)   canonical company-wide process catalog
--   + org.plant_process           (NEW)  N:M plant<->process ("which plant runs which process")
-- What STAYS put, on purpose:
--   auth.user_plant   stays in auth (identity/RBAC scope); its FK now crosses to org.plant.
--   auth.department, auth.role stay in auth (RBAC coupling: role_permission,
--                                            role_nav_section, role.department_id).
--   maint.asset_process stays in maint; its FK now crosses to org.process.
-- TRANSFER is metadata-only: data, FKs (bound by object_id -> survive intact,
-- transfer order irrelevant), CHECK constraints, defaults, indexes and stats all
-- move. Constraint/index names carry no schema prefix (repo convention: PK_plant,
-- UQ_plant_code, PK_process, UQ_process_code, ...), so NO names change and NO FK
-- needs recreation -- the cross-schema FKs simply re-point by object_id.
-- Schema-scoped permissions do NOT follow transferred objects, so `org` gets its
-- own grants (guarded, same pattern as V5/V6/V11/V12). `auth`/`maint` keep theirs.
-- Process administration moves from the maintenance module to the admin panel:
-- the maintenance process-catalog page is retired here (perm DELETE + nav_item
-- DELETE); the maintenance 'Máquinas' page (/maintenance/machines) stays.
-- Deploy coupling (outside this file): every Kysely query that binds
-- .withSchema("auth")/"maint" for plant or process must ship as "org" in the same
-- release; run `pnpm db:gen` after migrating to regenerate types. The nav_item
-- deletion below does NOT invalidate the unstable_cache "nav" tag -- the code
-- handles that via revalidateTag at build/deploy, not this migration.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- New schema
-- ---------------------------------------------------------------------------
IF SCHEMA_ID(N'org') IS NULL EXEC(N'CREATE SCHEMA org');
GO

-- ---------------------------------------------------------------------------
-- Transfers. Guarded on the SOURCE object so a partial/re-run skips what already
-- moved. FKs survive TRANSFER regardless of order; the incoming cross-schema FKs
-- (auth.user_plant, maint.asset, maint.asset_process, production.*) re-point by
-- object_id automatically -- nothing to drop or recreate.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.plant', N'U') IS NOT NULL
    ALTER SCHEMA org TRANSFER OBJECT::auth.plant;
GO

IF OBJECT_ID(N'maint.process', N'U') IS NOT NULL
    ALTER SCHEMA org TRANSFER OBJECT::maint.process;
GO

-- ---------------------------------------------------------------------------
-- org.plant_process — N:M plant <-> process ("which plant runs which process").
-- Link-row only (no is_active, no timestamps): same shape as maint.asset_process.
-- A process_id may repeat across plants (a single "Laser cut" process assigned to
-- plants 1,2,6). Unassignment = DELETE the row (nothing references it downstream).
-- NO ACTION on both FKs: protect the org.plant / org.process catalogs (app 409s).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'org.plant_process', N'U') IS NULL
BEGIN
    CREATE TABLE org.plant_process
    (
        plant_id   INT NOT NULL,
        process_id INT NOT NULL,
        CONSTRAINT PK_plant_process PRIMARY KEY (plant_id, process_id),
        CONSTRAINT FK_plant_process_plant FOREIGN KEY (plant_id)
            REFERENCES org.plant (plant_id),        -- no cascade: protect catalog rows
        CONSTRAINT FK_plant_process_process FOREIGN KEY (process_id)
            REFERENCES org.process (process_id)      -- no cascade: protect catalog rows
    );

    -- Reverse lookup "which plants run process X" (the forward lookup "which
    -- processes at plant Y" is already served by the leading PK column plant_id).
    -- Same pattern as IX_asset_process_process (V5).
    CREATE INDEX IX_plant_process_process ON org.plant_process (process_id);
END
GO

-- ---------------------------------------------------------------------------
-- RBAC permissions. The process catalog administration moves from the
-- maintenance module to the admin panel under the `org` module, matching where
-- plant/department/role live (org.*, seeded V8). Same MERGE-by-code pattern.
-- ---------------------------------------------------------------------------
MERGE auth.permission AS tgt
USING (VALUES
    (N'org.process:create',       N'Create company processes'),
    (N'org.process:update',       N'Edit company processes'),
    (N'org.process:delete',       N'Delete company processes'),
    (N'org.plant_process:assign', N'Assign / unassign processes to a plant')
) AS src (code, description)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, description) VALUES (src.code, src.description);
GO

-- ---------------------------------------------------------------------------
-- Retire the maintenance process-management permissions superseded above. The
-- process catalog is no longer managed from the maintenance module. Deleting a
-- permission cascades its role_permission grants (FK ON DELETE CASCADE, V8).
-- maint.asset_process stays in maintenance, but it has no dedicated permission
-- today (asset-process linking rides on maintenance.asset:update), so nothing
-- else to retire.
-- ---------------------------------------------------------------------------
DELETE FROM auth.permission
WHERE code IN (N'maintenance.process:create',
               N'maintenance.process:update',
               N'maintenance.process:delete');
GO

-- ---------------------------------------------------------------------------
-- Retire the maintenance 'Procesos' sidebar item (seeded by V9,
-- href = N'/maintenance/process'): that portal page is removed because process
-- administration moves to the admin panel. The 'Máquinas' item
-- (/maintenance/machines) stays untouched. Guarded/idempotent: resolves
-- section_id by code = N'maintenance' and matches the item by href, so it is a
-- no-op if the item (or the section) is already gone. No orphans: nav_item has
-- no children under this href.
-- Cache note: this DELETE does NOT invalidate the unstable_cache "nav" tag --
-- that is handled in code via revalidateTag at build/deploy, not by this
-- migration.
-- ---------------------------------------------------------------------------
DELETE i
FROM auth.nav_item AS i
JOIN auth.nav_section AS s ON s.section_id = i.section_id
WHERE s.code = N'maintenance'
  AND i.href = N'/maintenance/process';
GO

-- ---------------------------------------------------------------------------
-- Grants (least privilege) on the new schema. Schema-scoped grants do NOT follow
-- transferred objects, so `org` needs its own. `auth` and `maint` keep theirs
-- (they still hold user_plant / asset_process etc.). Guarded, idempotent, same
-- pattern as V5/V6/V11/V12. ebi_migrator owns the schema (no explicit DDL grant,
-- consistent with every prior schema migration).
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::org TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::org TO ebi_agent_ro');
GO
