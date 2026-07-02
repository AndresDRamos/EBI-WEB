-- V7__nav_registry.sql
-- Portal layout & navigation (plan 0005): DB-driven navigation registry.
--   auth.nav_section      -> topbar sections; routes exist in code, sections are
--                            seeded by the migration of the module that adds them.
--   auth.nav_item         -> sidebar items per section, one-level nesting via
--                            parent_item_id (depth enforced at app layer).
--   auth.role_nav_section -> role -> section visibility grant + priority
--                            (lower = earlier in topbar; ties break on
--                            nav_section.sort_order). The protected `admin` role
--                            sees everything at the app layer -> no grant rows.
-- Lives in `auth` (role-coupled; inherits V3 schema-scope grants). Deletes follow
-- the house pattern: child/junction rows cascade from their owning parent
-- (nav_section), FKs to catalog auth.role use NO ACTION (app returns 409).
-- updated_at is app-maintained (no triggers), consistent with dbo/auth/maint.
-- Item-level role gating is deliberately out of scope in v1 (future
-- auth.role_nav_item junction if ever needed -- do not pre-add columns).
-- Idempotent guards for safe dev re-runs.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- auth.nav_section — topbar sections (code = stable key used by the codebase)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.nav_section', N'U') IS NULL
BEGIN
    CREATE TABLE auth.nav_section
    (
        section_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_nav_section PRIMARY KEY,
        code       NVARCHAR(40)  NOT NULL,           -- stable key, e.g. 'maintenance'
        label      NVARCHAR(80)  NOT NULL,           -- admin-editable display name
        icon       NVARCHAR(64)  NULL,               -- lucide-react icon name; app falls back
        base_path  NVARCHAR(120) NOT NULL,           -- route base owned by code, not admins
        sort_order INT NOT NULL CONSTRAINT DF_nav_section_sort   DEFAULT (0),
        is_active  BIT NOT NULL CONSTRAINT DF_nav_section_active DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_nav_section_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_nav_section_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_nav_section_code      UNIQUE (code),
        CONSTRAINT UQ_nav_section_base_path UNIQUE (base_path),
        CONSTRAINT CK_nav_section_base_path CHECK (base_path LIKE N'/%')
    );
END
GO

-- ---------------------------------------------------------------------------
-- auth.nav_item — sidebar entries. One-level nesting via parent_item_id; the
-- composite self-FK (section_id, parent_item_id) guarantees the parent belongs
-- to the SAME section. Nesting depth (max 1) is enforced at the app layer:
-- a plain CHECK cannot read other rows, and a trigger is not worth it here.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.nav_item', N'U') IS NULL
BEGIN
    CREATE TABLE auth.nav_item
    (
        item_id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_nav_item PRIMARY KEY,
        section_id     INT NOT NULL,
        parent_item_id INT NULL,                     -- sub-section of (one level, app-enforced)
        label          NVARCHAR(80)  NOT NULL,
        icon           NVARCHAR(64)  NULL,
        href           NVARCHAR(200) NOT NULL,       -- must live under section base_path (app-validated)
        sort_order     INT NOT NULL CONSTRAINT DF_nav_item_sort   DEFAULT (0),
        is_active      BIT NOT NULL CONSTRAINT DF_nav_item_active DEFAULT (1),
        created_at     DATETIME2(0) NOT NULL CONSTRAINT DF_nav_item_created DEFAULT (SYSUTCDATETIME()),
        updated_at     DATETIME2(0) NOT NULL CONSTRAINT DF_nav_item_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_nav_item_section_item UNIQUE (section_id, item_id),  -- FK target for same-section parent rule
        CONSTRAINT UQ_nav_item_section_href UNIQUE (section_id, href),     -- no duplicate links within a section
        CONSTRAINT CK_nav_item_href CHECK (href LIKE N'/%'),
        CONSTRAINT CK_nav_item_not_own_parent CHECK (parent_item_id IS NULL OR parent_item_id <> item_id),
        CONSTRAINT FK_nav_item_section FOREIGN KEY (section_id)
            REFERENCES auth.nav_section (section_id) ON DELETE CASCADE,    -- items belong to their section
        CONSTRAINT FK_nav_item_parent FOREIGN KEY (section_id, parent_item_id)
            REFERENCES auth.nav_item (section_id, item_id)                 -- no cascade (self-FK cannot cascade in MSSQL)
    );

    CREATE INDEX IX_nav_item_parent ON auth.nav_item (section_id, parent_item_id)
        WHERE parent_item_id IS NOT NULL;            -- FK-lookup support when deleting parent items
END
GO

-- ---------------------------------------------------------------------------
-- auth.role_nav_section — role -> section visibility + topbar priority.
-- Lower priority wins; topbar orders by MIN(priority) across the user's roles,
-- then nav_section.sort_order. `admin` needs no rows (app-layer sees-all rule,
-- same approach as the protected-role RoleProtectedError pattern).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.role_nav_section', N'U') IS NULL
BEGIN
    CREATE TABLE auth.role_nav_section
    (
        role_id    INT NOT NULL,
        section_id INT NOT NULL,
        priority   INT NOT NULL CONSTRAINT DF_role_nav_section_priority DEFAULT (100),
        CONSTRAINT PK_role_nav_section PRIMARY KEY (role_id, section_id),
        CONSTRAINT FK_role_nav_section_role FOREIGN KEY (role_id)
            REFERENCES auth.role (role_id),                                -- no cascade: protect catalog (app 409s)
        CONSTRAINT FK_role_nav_section_section FOREIGN KEY (section_id)
            REFERENCES auth.nav_section (section_id) ON DELETE CASCADE     -- grants are config owned by the section
    );

    CREATE INDEX IX_role_nav_section_section ON auth.role_nav_section (section_id);
END
GO

-- ---------------------------------------------------------------------------
-- Seeds (idempotent). 'maintenance' ships is_active = 0: plan 0004 builds its
-- routes later and the admin panel flips it on — no extra migration needed.
-- ---------------------------------------------------------------------------
MERGE auth.nav_section AS tgt
USING (VALUES
    (N'dashboards',  N'Dashboards',    N'LayoutDashboard', N'/dashboards',  10, 1),
    (N'maintenance', N'Mantenimiento', N'Wrench',          N'/maintenance', 20, 0)
) AS src (code, label, icon, base_path, sort_order, is_active)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, label, icon, base_path, sort_order, is_active)
    VALUES (src.code, src.label, src.icon, src.base_path, src.sort_order, src.is_active);
GO

-- Single sidebar item for the dashboards section
INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Dashboards', N'LayoutDashboard', N'/dashboards', 10
FROM auth.nav_section s
WHERE s.code = N'dashboards'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item i
                  WHERE i.section_id = s.section_id AND i.href = N'/dashboards');
GO

-- Grant 'dashboards' to every existing active role EXCEPT admin (admin needs no
-- rows). Rationale: seeding to none would blank the portal for current viewers
-- on deploy day; this preserves today's effective access.
INSERT INTO auth.role_nav_section (role_id, section_id, priority)
SELECT r.role_id, s.section_id, 100
FROM auth.role r
CROSS JOIN auth.nav_section s
WHERE s.code = N'dashboards'
  AND r.is_active = 1
  AND r.name <> N'admin'
  AND NOT EXISTS (SELECT 1 FROM auth.role_nav_section g
                  WHERE g.role_id = r.role_id AND g.section_id = s.section_id);
GO

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
