-- V16__role_nav_item.sql
-- Per-page navigation visibility (plan admin-permissions-portal): lowers nav
-- authorization from section-level (V7 role_nav_section, ADR 0005) to PAGE-level.
--   auth.role_nav_item -> role -> nav_item visibility grant + intra-section order.
--                         SOURCE OF TRUTH for "can this role see/reach this page".
--                         `priority` orders pages WITHIN their section for the role
--                         (lower = earlier; ties break on nav_item.sort_order).
-- Derived rule (APP layer, not SQL): a section is visible to a role IFF the role
--   has >=1 role_nav_item row for an ACTIVE nav_item of that section.
-- role_nav_section is KEPT, but its meaning narrows to "section ORDER in the
--   topbar per role" (priority); it no longer GRANTS the section. No columns
--   dropped, no rename (kysely-codegen types + app cutover handle the semantics).
-- Supersedes ADR 0005 (section = unit of authorization -> page = unit); the
--   segment-layout guard must move to per-item resolution (tracked in the plan).
-- Deletes follow the house pattern (mirrors role_nav_section in V7): FK to the
--   catalog auth.role = NO ACTION (app 409s); FK to the owning parent
--   auth.nav_item = ON DELETE CASCADE (grants are config owned by the page).
-- Backfill preserves today's effective access: for every current section grant
--   (role_nav_section row) it grants EVERY active nav_item of that section, all
--   nesting levels, priority = nav_item.sort_order. `admin` has no grant rows
--   (app-layer bypass) -> gets none, consistent with V7/V8.
-- Idempotent guards for safe dev re-runs. Additive + data-only backfill: fully
--   reversible at the DB level (DROP TABLE restores prior state; role_nav_section
--   untouched). The IRREVERSIBLE part is the coupled APP cutover, not the SQL.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- auth.role_nav_item — role -> page visibility + intra-section order.
-- PK (role_id, item_id): leading role_id serves the permission-manager read
-- (all pages for a role) and the nav resolver (pages for the user's role set).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.role_nav_item', N'U') IS NULL
BEGIN
    CREATE TABLE auth.role_nav_item
    (
        role_id  INT NOT NULL,
        item_id  INT NOT NULL,
        priority INT NOT NULL CONSTRAINT DF_role_nav_item_priority DEFAULT (100),
        CONSTRAINT PK_role_nav_item PRIMARY KEY (role_id, item_id),
        CONSTRAINT FK_role_nav_item_role FOREIGN KEY (role_id)
            REFERENCES auth.role (role_id),                                -- no cascade: protect catalog (app 409s), per V7
        CONSTRAINT FK_role_nav_item_item FOREIGN KEY (item_id)
            REFERENCES auth.nav_item (item_id) ON DELETE CASCADE           -- grants are config owned by the page
    );

    -- Reverse-direction support: FK cascade on nav_item delete + "which roles
    -- see item X" (per-item view in the permission manager). Mirrors
    -- IX_role_nav_section_section in V7.
    CREATE INDEX IX_role_nav_item_item ON auth.role_nav_item (item_id);
END
GO

-- ---------------------------------------------------------------------------
-- Backfill — preserve today's effective access. Each current section grant
-- (role_nav_section) fans out to every ACTIVE nav_item of that section, ALL
-- nesting levels (no parent/child filter). priority = nav_item.sort_order so
-- the initial per-role page order matches the section's default order.
-- Idempotent (NOT EXISTS). admin has no role_nav_section rows -> no rows here.
-- ---------------------------------------------------------------------------
INSERT INTO auth.role_nav_item (role_id, item_id, priority)
SELECT rns.role_id, ni.item_id, ni.sort_order
FROM auth.role_nav_section AS rns
JOIN auth.nav_item          AS ni ON ni.section_id = rns.section_id
WHERE ni.is_active = 1
  AND NOT EXISTS (
        SELECT 1 FROM auth.role_nav_item AS x
        WHERE x.role_id = rns.role_id
          AND x.item_id = ni.item_id
      );
GO

-- ---------------------------------------------------------------------------
-- Grants — inherited from V3's SCHEMA::auth grants; re-asserted guarded as a
-- safety net (no-op where principals already have schema-scope grants).
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::auth TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::auth TO ebi_agent_ro');
GO
