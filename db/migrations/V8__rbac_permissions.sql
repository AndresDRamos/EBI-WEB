-- V8__rbac_permissions.sql
-- Resource+action RBAC (plan 0006-rbac-actions): admin-managed permission grants.
--   auth.role            += department_id (NULL = cross-department profile).
--                           Semantic shift: role now means ACCESS PROFILE, not
--                           job title. Existing rows stay NULL (transversal);
--                           department-scoped profiles ("Técnico Mantenimiento")
--                           are created from the admin panel as needed. No table
--                           rename: kysely-codegen types, JWT `roles` claim and
--                           PROTECTED_ROLE stay untouched.
--   auth.permission      -> permission catalog, code = '<module>.<resource>:<action>'
--                           (e.g. 'maintenance.asset:create'). Seeded by migrations
--                           only (same pattern as nav_section in V7); the admin
--                           panel assigns/revokes grants, never creates permissions.
--                           No is_active: retiring a permission = a migration
--                           deletes it (grants cascade).
--   auth.role_permission -> role -> permission grant. The protected `admin` role
--                           bypasses at the app layer -> no grant rows (same rule
--                           as role_nav_section in V7).
-- Deletes follow the house pattern: grants cascade from their owning parent
-- (permission, migration-owned); FKs to catalogs auth.role / auth.department use
-- NO ACTION (app returns 409). updated_at is app-maintained (no triggers).
-- role_permission ships EMPTY: today's only user is admin (bypass), so seeding
-- nothing preserves effective access — unlike V7 where viewers had nav to keep.
-- No per-user overrides in v1 (no user_permission table — do not pre-add).
-- Idempotent guards for safe dev re-runs.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- auth.role — department_id (NULL = cross-department access profile).
-- NULLable, no back-fill: the 3 existing job-title rows become transversal
-- profiles keeping their nav grants; they are renamed/scoped from the panel
-- when departmentalized. UQ_role_name stays global (name encodes department
-- by readable convention).
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'auth.role', N'department_id') IS NULL
BEGIN
    ALTER TABLE auth.role
        ADD department_id INT NULL;
END
GO

IF OBJECT_ID(N'auth.FK_role_department', N'F') IS NULL
BEGIN
    ALTER TABLE auth.role
        ADD CONSTRAINT FK_role_department FOREIGN KEY (department_id)
            REFERENCES auth.department (department_id);  -- no cascade: protect catalog (app 409s)
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'IX_role_department'
                 AND object_id = OBJECT_ID(N'auth.role'))
BEGIN
    CREATE INDEX IX_role_department ON auth.role (department_id)
        WHERE department_id IS NOT NULL;   -- FK-lookup support on department delete
END
GO

-- ---------------------------------------------------------------------------
-- auth.permission — permission catalog (code = stable key used by the codebase)
-- Codes are lowercase '<module>.<resource>:<action>', enforced by CK below
-- (binary collation so the class rejects uppercase regardless of DB collation).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.permission', N'U') IS NULL
BEGIN
    CREATE TABLE auth.permission
    (
        permission_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_permission PRIMARY KEY,
        code          NVARCHAR(80)  NOT NULL,        -- '<module>.<resource>:<action>'
        description   NVARCHAR(256) NULL,
        created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_permission_created DEFAULT (SYSUTCDATETIME()),
        updated_at    DATETIME2(0) NOT NULL CONSTRAINT DF_permission_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_permission_code UNIQUE (code),
        CONSTRAINT CK_permission_code_format CHECK (
            code LIKE N'_%._%:_%'                    -- has module, resource and action parts
            AND code NOT LIKE N'%:%:%'               -- single action separator
            AND code COLLATE Latin1_General_100_BIN2
                NOT LIKE N'%[^a-z0-9._:]%'           -- lowercase alphanumerics + separators only
        )
    );
END
GO

-- ---------------------------------------------------------------------------
-- auth.role_permission — access profile -> permission grant. `admin` needs no
-- rows (app-layer bypass, same approach as role_nav_section). Grants are config
-- owned by the permission (migration-owned entity) -> cascade from permission;
-- NO ACTION to role protects the catalog (app clears grants or 409s).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.role_permission', N'U') IS NULL
BEGIN
    CREATE TABLE auth.role_permission
    (
        role_id       INT NOT NULL,
        permission_id INT NOT NULL,
        CONSTRAINT PK_role_permission PRIMARY KEY (role_id, permission_id),
        CONSTRAINT FK_role_permission_role FOREIGN KEY (role_id)
            REFERENCES auth.role (role_id),                                -- no cascade: protect catalog (app 409s)
        CONSTRAINT FK_role_permission_permission FOREIGN KEY (permission_id)
            REFERENCES auth.permission (permission_id) ON DELETE CASCADE   -- grants die with their permission
    );

    CREATE INDEX IX_role_permission_permission ON auth.role_permission (permission_id);
END
GO

-- ---------------------------------------------------------------------------
-- Seeds (idempotent, matched by code — real IDs are non-contiguous). One row
-- per EXISTING mutation endpoint (verified against src/app/api 2026-07-02);
-- GETs stay on requireUser/requireAnyRole as today. Future modules seed their
-- own permissions in their own migration. Note: no 'org.user:delete' — users
-- have no DELETE endpoint (deactivation via PATCH); seed it when/if it ships.
-- ---------------------------------------------------------------------------
MERGE auth.permission AS tgt
USING (VALUES
    -- org: users, roles (access profiles), plants, departments
    (N'org.user:create',               N'Create portal users'),
    (N'org.user:update',               N'Edit portal users (data, roles, scope, active flag)'),
    (N'org.user:invite',               N'Issue/reissue activation invitations'),
    (N'org.role:create',               N'Create access profiles'),
    (N'org.role:update',               N'Edit access profiles'),
    (N'org.role:delete',               N'Delete access profiles'),
    (N'org.plant:create',              N'Create plants'),
    (N'org.plant:update',              N'Edit plants'),
    (N'org.plant:delete',              N'Delete plants'),
    (N'org.department:create',         N'Create departments'),
    (N'org.department:update',         N'Edit departments'),
    (N'org.department:delete',         N'Delete departments'),
    -- reports: Power BI reports and categories
    (N'reports.report:create',         N'Register Power BI reports'),
    (N'reports.report:update',         N'Edit Power BI reports'),
    (N'reports.report:delete',         N'Delete Power BI reports'),
    (N'reports.category:create',       N'Create report categories'),
    (N'reports.category:update',       N'Edit report categories'),
    (N'reports.category:delete',       N'Delete report categories'),
    -- navigation: sections are migration-seeded (no create); items are admin-managed
    (N'navigation.section:update',     N'Edit navigation sections (label, icon, order, active)'),
    (N'navigation.section:delete',     N'Delete navigation sections'),
    (N'navigation.item:create',        N'Create sidebar items'),
    (N'navigation.item:update',        N'Edit sidebar items'),
    (N'navigation.item:delete',        N'Delete sidebar items'),
    (N'navigation.grants:update',      N'Assign section visibility to access profiles'),
    -- maintenance: assets, processes, documents, restrictions
    (N'maintenance.asset:create',      N'Create maintenance assets'),
    (N'maintenance.asset:update',      N'Edit maintenance assets'),
    (N'maintenance.asset:delete',      N'Delete maintenance assets'),
    (N'maintenance.process:create',    N'Create maintenance processes'),
    (N'maintenance.process:update',    N'Edit maintenance processes'),
    (N'maintenance.process:delete',    N'Delete maintenance processes'),
    (N'maintenance.document:create',   N'Upload asset documents'),
    (N'maintenance.document:delete',   N'Delete asset documents'),
    (N'maintenance.restriction:create',N'Create asset restrictions'),
    (N'maintenance.restriction:update',N'Edit asset restrictions'),
    (N'maintenance.restriction:delete',N'Delete asset restrictions')
) AS src (code, description)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, description) VALUES (src.code, src.description);
GO

-- No role_permission seeds: the only current user is admin (app-layer bypass),
-- so an empty grant table preserves today's effective access exactly.

-- ---------------------------------------------------------------------------
-- Grants — technically inherited from V3's SCHEMA::auth grants (schema-scope
-- grants cover future objects). Re-asserted guarded as a safety net for
-- environments where the principals were created after V3 ran; no-op otherwise.
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::auth TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::auth TO ebi_agent_ro');
GO
