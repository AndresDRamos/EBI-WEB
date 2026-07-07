-- V14__remove_plant_layout_nav_item.sql
-- Removes the 'Layout' nav item that V13 seeded under the 'production' section.
-- Why: the plant-layout module is dark-parked (decision 2026-07-06, amendment to
-- plan plant-layout-foundation) -- its pages move to an admin-only /test/layout
-- area outside the nav registry, so the module must NOT appear in the portal nav
-- yet. Everything else from V13 stays: tables, permissions and schema grants are
-- untouched.
-- Idempotency: a DELETE whose WHERE matches nothing on re-run is a no-op -- no
-- guard needed (same spirit as V13's NOT EXISTS guards). Match by href scoped to
-- the 'production' section, mirroring how V13 seeded it.
-- On production (EBI), where V13 has not been applied yet: V13 will seed the row
-- and V14 will delete it in the same migrate run -- harmless by design.
-- Reversible: re-running the V13 INSERT...SELECT restores the row (sort_order 30).
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DELETE i
FROM auth.nav_item AS i
JOIN auth.nav_section AS s
    ON s.section_id = i.section_id
WHERE s.code = N'production'
  AND i.href = N'/production/layout';
GO
