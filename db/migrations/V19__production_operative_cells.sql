-- V19__production_operative_cells.sql
-- Plan production-operative-cells: collapses the two-level production model
-- (production_line -> cell) into a SINGLE self-referencing entity:
--   production.cell += parent_cell_id (self-FK), size_x_m / size_y_m, process_id
--   production.production_line rows become PARENT cells (line_id -> cell_id map
--   captured via MERGE ... OUTPUT, never matched by code)
--   production.cell.plant_id is DROPPED: plant is now DERIVED via
--   org.location.plant_id (same move V18 made on maint.asset)
--   production.cell.location_id flips NULL -> NOT NULL (deterministic per-plant
--   backfill: single active location if exactly one, else a guarded 'GEN'/'General'
--   location is created and used)
--   production.cell.sequence_in_line -> sequence_in_parent (sp_rename)
--   + production.cell_code_sequence: race-safe per-location counter for the cell
--     code (mirror of maint.asset_code_sequence, V17/V18)
-- DESTRUCTIVE / IRREVERSIBLE operations (flagged):
--   * DROP COLUMN production.cell.line_id  -- the line link survives only as
--     parent_cell_id; after the drop there is no way to tell an ex-line parent
--     cell from a hand-created parent cell.
--   * DROP COLUMN production.cell.plant_id -- the direct plant link is discarded;
--     plant becomes derived via location. Cannot be rebuilt if a location is ever
--     re-parented to another plant.
--   * DROP TABLE production.production_line -- rows are converted to cells first,
--     but line identity (line_id values, UQ_production_line_code) is gone forever.
--   * ALTER COLUMN location_id NOT NULL -- one-way tightening (rollback would
--     need a data decision, not just DDL).
-- Depth note: the cell hierarchy is LIMITED TO DEPTH 1 (parent cells cannot
-- themselves have a parent). Not expressible as a CHECK and triggers are banned
-- (repo convention), so depth-1 is ENFORCED IN THE APP layer only; the DB only
-- blocks self-parenting (CK_cell_not_self_parent).
-- Data verified 2026-07-09 (EBI_dev): 1 production_line, 4 cells (all
-- location_id NULL, plant 1; 2 on the line with sequence 10/20), 0 assignments,
-- 1 active org.location for plant 1 ('NAVE1'). Prod EBI: production.* empty, so
-- every conversion step is a safe no-op there.
-- FKs use NO ACTION (protect catalog rows); updated_at is app-maintained (no
-- triggers). Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- 1) production.cell — new columns (all NULL-able at this point; constraints
--    arrive in step 6, after the data conversion).
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'production.cell', N'parent_cell_id') IS NULL
    ALTER TABLE production.cell ADD parent_cell_id INT NULL;
GO
IF COL_LENGTH(N'production.cell', N'size_x_m') IS NULL
    ALTER TABLE production.cell ADD size_x_m DECIMAL(9,3) NULL;
GO
IF COL_LENGTH(N'production.cell', N'size_y_m') IS NULL
    ALTER TABLE production.cell ADD size_y_m DECIMAL(9,3) NULL;
GO
IF COL_LENGTH(N'production.cell', N'process_id') IS NULL
    ALTER TABLE production.cell ADD process_id INT NULL;
GO

-- ---------------------------------------------------------------------------
-- 2) Backfill location_id, deterministic PER PLANT, for every plant that has
--    cells without a location or rows in production_line:
--      exactly 1 active org.location  -> use it
--      0 or >1 active locations       -> guarded INSERT of ('GEN', 'General')
--                                        for that plant, then use it.
--    Evaluated post-insert the rule stays consistent: a plant that had 0 active
--    locations now has exactly one (GEN); a plant that had >1 falls through to
--    GEN explicitly. No-op when production.* is empty (prod EBI).
--    Guards: NOT EXISTS on (plant_id, code) for the insert (UQ_location_plant_code
--    backs it); WHERE location_id IS NULL makes the UPDATE naturally idempotent.
-- ---------------------------------------------------------------------------
;WITH plants_in_scope AS (
    SELECT plant_id FROM production.cell WHERE location_id IS NULL
    UNION
    SELECT plant_id FROM production.production_line
)
INSERT INTO org.location (plant_id, code, name)
SELECT p.plant_id, N'GEN', N'General'
FROM plants_in_scope AS p
WHERE (SELECT COUNT(*) FROM org.location AS l
       WHERE l.plant_id = p.plant_id AND l.is_active = 1) <> 1
  AND NOT EXISTS (SELECT 1 FROM org.location AS l
                  WHERE l.plant_id = p.plant_id AND l.code = N'GEN');
GO

UPDATE c
SET c.location_id = COALESCE(one_active.location_id, gen.location_id)
FROM production.cell AS c
OUTER APPLY (
    -- the plant's single active location, if it is single
    SELECT MIN(l.location_id) AS location_id
    FROM org.location AS l
    WHERE l.plant_id = c.plant_id AND l.is_active = 1
    HAVING COUNT(*) = 1
) AS one_active
OUTER APPLY (
    -- the plant's 'GEN' fallback (created above when needed)
    SELECT l.location_id
    FROM org.location AS l
    WHERE l.plant_id = c.plant_id AND l.code = N'GEN'
) AS gen
WHERE c.location_id IS NULL;
GO

-- ---------------------------------------------------------------------------
-- 3) Lines -> parent cells. One new cell per production_line row.
--    Code collision guard: if the line's code already exists in cell, use
--    code + '-L' (would still abort on UQ_cell_code if THAT collides too --
--    the correct outcome, do not work around it).
--    Location: the one shared by ALL its child cells after step 2; if no
--    children or mixed locations, the plant default from step 2.
--    The line_id -> new cell_id map is captured with MERGE ... OUTPUT into a
--    table variable (INSERT..SELECT cannot OUTPUT source columns); matching
--    back by code is deliberately NOT trusted.
--    Whole step guarded on cell.line_id still existing: after step 4 drops it,
--    a re-run skips the conversion entirely.
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'production.cell', N'line_id') IS NOT NULL
   AND OBJECT_ID(N'production.production_line', N'U') IS NOT NULL
BEGIN
    DECLARE @line_map TABLE (line_id INT NOT NULL PRIMARY KEY, cell_id INT NOT NULL);

    MERGE production.cell AS tgt
    USING (
        SELECT pl.line_id,
               CASE WHEN EXISTS (SELECT 1 FROM production.cell AS c WHERE c.code = pl.code)
                    THEN pl.code + N'-L'
                    ELSE pl.code
               END AS code,
               pl.name,
               pl.plant_id,
               COALESCE(shared.location_id, one_active.location_id, gen.location_id) AS location_id,
               pl.is_active
        FROM production.production_line AS pl
        OUTER APPLY (
            -- location shared by ALL child cells (NULL when none or mixed)
            SELECT MIN(c.location_id) AS location_id
            FROM production.cell AS c
            WHERE c.line_id = pl.line_id
            HAVING COUNT(*) >= 1 AND MIN(c.location_id) = MAX(c.location_id)
        ) AS shared
        OUTER APPLY (
            SELECT MIN(l.location_id) AS location_id
            FROM org.location AS l
            WHERE l.plant_id = pl.plant_id AND l.is_active = 1
            HAVING COUNT(*) = 1
        ) AS one_active
        OUTER APPLY (
            SELECT l.location_id
            FROM org.location AS l
            WHERE l.plant_id = pl.plant_id AND l.code = N'GEN'
        ) AS gen
    ) AS src
        ON 1 = 0                                            -- always insert
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (code, name, plant_id, location_id, is_active)
        VALUES (src.code, src.name, src.plant_id, src.location_id, src.is_active)
    OUTPUT src.line_id, inserted.cell_id INTO @line_map (line_id, cell_id);

    UPDATE c
    SET c.parent_cell_id = m.cell_id
    FROM production.cell AS c
    JOIN @line_map AS m ON m.line_id = c.line_id;
END
GO

-- ---------------------------------------------------------------------------
-- 4) Drops (DESTRUCTIVE -- see header). Order: indexes -> CHECKs -> FK ->
--    rename -> line_id column -> plant index/FK/column -> the line table.
--    Exact names verified against V11 (UQ_cell_line_sequence, IX_cell_line,
--    CK_cell_sequence, CK_cell_sequence_requires_line, FK_cell_line,
--    IX_cell_plant, FK_cell_plant).
-- ---------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_cell_line_sequence' AND object_id = OBJECT_ID(N'production.cell'))
    DROP INDEX UQ_cell_line_sequence ON production.cell;
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cell_line' AND object_id = OBJECT_ID(N'production.cell'))
    DROP INDEX IX_cell_line ON production.cell;
GO
IF OBJECT_ID(N'production.CK_cell_sequence', N'C') IS NOT NULL
    ALTER TABLE production.cell DROP CONSTRAINT CK_cell_sequence;
GO
IF OBJECT_ID(N'production.CK_cell_sequence_requires_line', N'C') IS NOT NULL
    ALTER TABLE production.cell DROP CONSTRAINT CK_cell_sequence_requires_line;
GO
IF OBJECT_ID(N'production.FK_cell_line', N'F') IS NOT NULL
    ALTER TABLE production.cell DROP CONSTRAINT FK_cell_line;
GO

-- sequence_in_line -> sequence_in_parent (same sp_rename pattern as V17; the
-- column has no default/check/index left at this point).
IF COL_LENGTH(N'production.cell', N'sequence_in_line') IS NOT NULL
   AND COL_LENGTH(N'production.cell', N'sequence_in_parent') IS NULL
    EXEC sp_rename N'production.cell.sequence_in_line', N'sequence_in_parent', N'COLUMN';
GO

-- IRREVERSIBLE: the line membership survives only as parent_cell_id.
IF COL_LENGTH(N'production.cell', N'line_id') IS NOT NULL
    ALTER TABLE production.cell DROP COLUMN line_id;
GO

-- IRREVERSIBLE: plant becomes DERIVED via org.location.plant_id (V18 precedent
-- on maint.asset). Drop order: index -> FK -> column.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cell_plant' AND object_id = OBJECT_ID(N'production.cell'))
    DROP INDEX IX_cell_plant ON production.cell;
GO
IF OBJECT_ID(N'production.FK_cell_plant', N'F') IS NOT NULL
    ALTER TABLE production.cell DROP CONSTRAINT FK_cell_plant;
GO
IF COL_LENGTH(N'production.cell', N'plant_id') IS NOT NULL
    ALTER TABLE production.cell DROP COLUMN plant_id;
GO

-- IRREVERSIBLE: rows already converted to parent cells in step 3; the table
-- (and line_id identity values) are discarded.
IF OBJECT_ID(N'production.production_line', N'U') IS NOT NULL
    DROP TABLE production.production_line;
GO

-- ---------------------------------------------------------------------------
-- 5) location_id NULL -> NOT NULL (one-way tightening). The V18 filtered index
--    must go first (it blocks ALTER COLUMN); recreated unfiltered on
--    (location_id, is_active), same shape as IX_asset_location (V18).
-- ---------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cell_location' AND object_id = OBJECT_ID(N'production.cell') AND has_filter = 1)
    DROP INDEX IX_cell_location ON production.cell;
GO
ALTER TABLE production.cell ALTER COLUMN location_id INT NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cell_location' AND object_id = OBJECT_ID(N'production.cell'))
    CREATE INDEX IX_cell_location ON production.cell (location_id, is_active);
GO

-- ---------------------------------------------------------------------------
-- 6) New constraints + indexes for the self-referencing model. All WITH CHECK
--    (default): existing rows must pass. Depth-1 is app-enforced (see header).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'production.FK_cell_parent', N'F') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT FK_cell_parent FOREIGN KEY (parent_cell_id)
        REFERENCES production.cell (cell_id);               -- no cascade: protect hierarchy rows
GO
IF OBJECT_ID(N'production.FK_cell_process', N'F') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT FK_cell_process FOREIGN KEY (process_id)
        REFERENCES org.process (process_id);                -- no cascade: protect catalog rows
GO
IF OBJECT_ID(N'production.CK_cell_not_self_parent', N'C') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT CK_cell_not_self_parent
        CHECK (parent_cell_id IS NULL OR parent_cell_id <> cell_id);
GO
IF OBJECT_ID(N'production.CK_cell_sequence', N'C') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT CK_cell_sequence
        CHECK (sequence_in_parent IS NULL OR sequence_in_parent > 0);
GO
IF OBJECT_ID(N'production.CK_cell_sequence_requires_parent', N'C') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT CK_cell_sequence_requires_parent
        CHECK (parent_cell_id IS NOT NULL OR sequence_in_parent IS NULL);
GO
IF OBJECT_ID(N'production.CK_cell_size_x', N'C') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT CK_cell_size_x
        CHECK (size_x_m IS NULL OR size_x_m > 0);
GO
IF OBJECT_ID(N'production.CK_cell_size_y', N'C') IS NULL
    ALTER TABLE production.cell ADD CONSTRAINT CK_cell_size_y
        CHECK (size_y_m IS NULL OR size_y_m > 0);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cell_parent' AND object_id = OBJECT_ID(N'production.cell'))
    CREATE INDEX IX_cell_parent ON production.cell (parent_cell_id)
        WHERE parent_cell_id IS NOT NULL;                   -- filtered: only pays for children
GO
-- Prevent duplicate "Op 20" under the same parent (successor of the V11
-- UQ_cell_line_sequence, now filtered on BOTH columns because parent cells and
-- unsequenced children must stay unconstrained).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_cell_parent_sequence' AND object_id = OBJECT_ID(N'production.cell'))
    CREATE UNIQUE INDEX UQ_cell_parent_sequence
        ON production.cell (parent_cell_id, sequence_in_parent)
        WHERE parent_cell_id IS NOT NULL AND sequence_in_parent IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 7) production.cell_code_sequence — race-safe per-LOCATION counter backing the
--    app-generated cell code. Mirror of maint.asset_code_sequence (V17/V18):
--    the app locks and increments the row inside the cell-insert transaction.
--    No triggers, no DB default on the code.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'production.cell_code_sequence', N'U') IS NULL
BEGIN
    CREATE TABLE production.cell_code_sequence
    (
        location_id INT NOT NULL CONSTRAINT PK_cell_code_sequence PRIMARY KEY,
        next_seq    INT NOT NULL CONSTRAINT DF_cell_code_sequence_next DEFAULT (1),
        CONSTRAINT CK_cell_code_sequence_next CHECK (next_seq >= 1),
        CONSTRAINT FK_cell_code_sequence_location FOREIGN KEY (location_id)
            REFERENCES org.location (location_id)           -- no cascade
    );
END
GO

-- ---------------------------------------------------------------------------
-- 8) Nav: retire '/production/lines' and '/production/cells' (deletes cascade
--    to auth.role_nav_item, V16); seed 'Celdas operativas' in their place.
--    Same DELETE-by-section+href pattern as V14/V15 and the same guarded
--    INSERT pattern as V11. Icon 'LayoutGrid' is already in the curated
--    NavIcon map (seeded by V11).
-- ---------------------------------------------------------------------------
DELETE i
FROM auth.nav_item AS i
JOIN auth.nav_section AS s ON s.section_id = i.section_id
WHERE s.code = N'production'
  AND i.href IN (N'/production/lines', N'/production/cells');
GO

INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Celdas operativas', N'LayoutGrid', N'/production/operative-cells', 10
FROM auth.nav_section AS s
WHERE s.code = N'production'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item AS i
                  WHERE i.section_id = s.section_id AND i.href = N'/production/operative-cells');
GO

-- ---------------------------------------------------------------------------
-- 9) RBAC: retire the line-entity permissions (the entity no longer exists).
--    Deleting a permission cascades its role_permission grants
--    (FK_role_permission_permission ON DELETE CASCADE, V8) -- same pattern as
--    V15. production.cell:* and production.assignment:* stay untouched.
-- ---------------------------------------------------------------------------
DELETE FROM auth.permission
WHERE code IN (N'production.line:create', N'production.line:update');
GO

-- ---------------------------------------------------------------------------
-- Grants. cell_code_sequence lives in schema production, already covered by the
-- SCHEMA::production grants from V12. Re-issued idempotently as
-- belt-and-suspenders (V17/V18 precedent).
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::production TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::production TO ebi_agent_ro');
GO
