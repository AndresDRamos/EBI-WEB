-- V9__maintenance_nav_items.sql
-- Maintenance nav items (blueprint retrofit): V7 seeded the 'maintenance'
-- section without sidebar items (its routes did not exist yet). The module
-- blueprint (§1) requires each module's migration to seed section + items;
-- this backfills the two real maintenance pages:
--   /maintenance/machines -> 'Máquinas' (machine catalog)
--   /maintenance/process  -> 'Procesos' (process catalog)
-- Data-only (no DDL). Deliberately NOT touched:
--   nav_section.is_active     -> admin-managed since V7 shipped it off.
--   auth.role_nav_section     -> section grants are admin configuration.
-- Idempotent per V7's house pattern (NOT EXISTS on section_id + href), so it
-- is a no-op where an admin already captured these links from /admin/access.
-- Resolves section_id by code = N'maintenance'; if the section is absent the
-- SELECT yields zero rows -> no orphan items, no failure.
-- Icon note: 'Settings2' is not in the curated NavIcon map
-- (src/modules/navigation/icons.tsx); 'Factory' is used for Procesos instead.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- Sidebar items for the maintenance section (top level, parent_item_id NULL)
-- ---------------------------------------------------------------------------
INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Máquinas', N'Wrench', N'/maintenance/machines', 10
FROM auth.nav_section s
WHERE s.code = N'maintenance'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item i
                  WHERE i.section_id = s.section_id
                    AND i.href = N'/maintenance/machines');
GO

INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Procesos', N'Factory', N'/maintenance/process', 20
FROM auth.nav_section s
WHERE s.code = N'maintenance'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item i
                  WHERE i.section_id = s.section_id
                    AND i.href = N'/maintenance/process');
GO
