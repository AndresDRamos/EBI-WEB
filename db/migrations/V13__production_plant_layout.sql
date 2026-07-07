-- V13__production_plant_layout.sql
-- Plant layout foundation (plan plant-layout-foundation): digitizes plant floor
-- layouts and gives assets a physical place on them.
--   production.plant_layout    -> immutable, VERSIONED canvas per plant. A DXF upload
--                                 is parsed into normalized JSON and lands as a
--                                 'draft'; confirming it activates the draft and
--                                 archives the previous 'active'. Exactly ONE active
--                                 per plant (filtered unique index). Geometry is never
--                                 edited in place -- a new upload is a new version.
--   production.asset_footprint -> top-view shape per asset (ONE per asset, editable
--                                 in place: footprint geometry is presentational,
--                                 not history-critical, unlike placements).
--   production.asset_placement -> TEMPORAL, historized position of an asset on a
--                                 layout. Same invariant family as
--                                 asset_cell_assignment (V11): close valid_to +
--                                 insert a new row -- never UPDATE x/y in place,
--                                 and NO updated_at on purpose.
-- Geometry is JSON in NVARCHAR(MAX) (ISJSON-checked), NOT the native GEOMETRY type:
-- rendering happens client-side, no server-side spatial predicates exist yet, and
-- DXF-derived payloads (zones/aisles/route-centerlines/ports + metadata) do not map
-- cleanly onto OGC primitives. Revisit only when a real spatial query appears.
-- plant_layout has NO generic updated_at (same reasoning as asset_cell_assignment):
-- the only legitimate mutations are lifecycle transitions, captured explicitly by
-- activated_at / archived_at instead.
-- Enumerations via named CHECK constraints; FKs NO ACTION (protect catalogs /
-- preserve history) -- consistent with V5/V6/V11.
-- Cross-schema invariant NOT enforceable here without triggers (house style: none):
-- maint.asset.plant_id must match plant_layout.plant_id for a placement -- the app
-- validates it when creating placements.
-- Grants: V12's schema-level grants on SCHEMA::production cover new tables
-- automatically -- no new GRANT statements in this file.
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- production.plant_layout — immutable, versioned canvas per plant.
-- geometry: normalized JSON (outline / zones / aisles / route-centerlines /
-- ports), meters, origin (0,0) bottom-left; width_m/height_m are the canvas
-- extents. source_blob_path points at the archived original DXF in Azure Blob
-- (path only, never content) -- NOT NULL because every version originates from
-- an upload today; relax to NULL later if a manual authoring path appears.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'production.plant_layout', N'U') IS NULL
BEGIN
    CREATE TABLE production.plant_layout
    (
        layout_id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plant_layout PRIMARY KEY,
        plant_id         INT NOT NULL,
        version          INT NOT NULL,
        name             NVARCHAR(160) NOT NULL,
        note             NVARCHAR(1000) NULL,
        source_blob_path NVARCHAR(400) NOT NULL,
        width_m          DECIMAL(9,3) NOT NULL,
        height_m         DECIMAL(9,3) NOT NULL,
        geometry         NVARCHAR(MAX) NOT NULL,
        status           NVARCHAR(20) NOT NULL CONSTRAINT DF_plant_layout_status DEFAULT (N'draft'),
        created_by       INT NOT NULL,
        created_at       DATETIME2(0) NOT NULL CONSTRAINT DF_plant_layout_created DEFAULT (SYSUTCDATETIME()),
        activated_at     DATETIME2(0) NULL,                 -- set once, when the draft is confirmed
        archived_at      DATETIME2(0) NULL,                 -- set once, when a newer version replaces it
        CONSTRAINT CK_plant_layout_version  CHECK (version > 0),
        CONSTRAINT CK_plant_layout_extents  CHECK (width_m > 0 AND height_m > 0),
        CONSTRAINT CK_plant_layout_geometry_json CHECK (ISJSON(geometry) = 1),
        CONSTRAINT CK_plant_layout_status
            CHECK (status IN (N'draft', N'active', N'archived')),
        CONSTRAINT UQ_plant_layout_plant_version UNIQUE (plant_id, version),
        CONSTRAINT FK_plant_layout_plant FOREIGN KEY (plant_id)
            REFERENCES auth.plant (plant_id),              -- no cascade: protect catalog rows
        CONSTRAINT FK_plant_layout_created_by FOREIGN KEY (created_by)
            REFERENCES auth.app_user (user_id)             -- no cascade: preserve authorship history
    );

    -- Exactly one ACTIVE layout per plant. Drafts and archived versions are
    -- unconstrained (many drafts may coexist; archived history accumulates).
    CREATE UNIQUE INDEX UQ_plant_layout_active
        ON production.plant_layout (plant_id)
        WHERE status = N'active';

    -- No IX on plant_id alone: UQ_plant_layout_plant_version (plant_id, version)
    -- already serves "versions of plant X" seeks and the FK.
END
GO

-- ---------------------------------------------------------------------------
-- production.asset_footprint — top-view shape per asset, ONE per asset.
-- geometry: JSON polygon + optional IN/OUT ports, local coordinates in meters
-- (a plain W×D rectangle is stored the same way, source_kind = 'rectangle').
-- Editable in place (created_at/updated_at, app-maintained) -- footprint shape
-- is presentation, not history; position history lives in asset_placement.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'production.asset_footprint', N'U') IS NULL
BEGIN
    CREATE TABLE production.asset_footprint
    (
        footprint_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_footprint PRIMARY KEY,
        asset_id         INT NOT NULL,
        width_m          DECIMAL(9,3) NOT NULL,
        depth_m          DECIMAL(9,3) NOT NULL,
        geometry         NVARCHAR(MAX) NOT NULL,
        source_kind      NVARCHAR(12) NOT NULL,
        source_blob_path NVARCHAR(400) NULL,
        created_by       INT NOT NULL,
        created_at       DATETIME2(0) NOT NULL CONSTRAINT DF_asset_footprint_created DEFAULT (SYSUTCDATETIME()),
        updated_at       DATETIME2(0) NOT NULL CONSTRAINT DF_asset_footprint_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_asset_footprint_extents CHECK (width_m > 0 AND depth_m > 0),
        CONSTRAINT CK_asset_footprint_geometry_json CHECK (ISJSON(geometry) = 1),
        CONSTRAINT CK_asset_footprint_source_kind
            CHECK (source_kind IN (N'dxf', N'rectangle')),
        -- a rectangle footprint has no source file; a dxf one may archive its path
        CONSTRAINT CK_asset_footprint_source_path
            CHECK (source_kind = N'dxf' OR source_blob_path IS NULL),
        CONSTRAINT UQ_asset_footprint_asset UNIQUE (asset_id),
        CONSTRAINT FK_asset_footprint_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id),             -- no cascade: protect catalog rows
        CONSTRAINT FK_asset_footprint_created_by FOREIGN KEY (created_by)
            REFERENCES auth.app_user (user_id)             -- no cascade: preserve authorship history
    );
    -- UQ_asset_footprint_asset doubles as the FK-support index on asset_id.
END
GO

-- ---------------------------------------------------------------------------
-- production.asset_placement — TEMPORAL position of an asset on a layout.
-- Reposition = close the current row (valid_to) + insert a new one; x/y/rotation
-- are never UPDATEd in place. NO updated_at, on purpose (same reasoning as
-- asset_cell_assignment in V11). Filtered unique on (layout_id, asset_id): one
-- CURRENT placement per asset PER LAYOUT -- deliberately NOT per asset globally,
-- so a draft layout can be populated while the active layout still holds the
-- asset's live position (the draft-preparation overlap window). Physical truth
-- ("where is the asset really") = current placement JOIN its layout WHERE
-- status = 'active'; UQ_plant_layout_active guarantees that join yields at most
-- one row per plant. On activation the app closes the outgoing layout's open
-- rows and inserts fresh rows on the new version (carry-forward, approved
-- 2026-07-06); archived layouts keep their closed history untouched.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'production.asset_placement', N'U') IS NULL
BEGIN
    CREATE TABLE production.asset_placement
    (
        placement_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_placement PRIMARY KEY,
        layout_id    INT NOT NULL,
        asset_id     INT NOT NULL,
        x_m          DECIMAL(9,3) NOT NULL,
        y_m          DECIMAL(9,3) NOT NULL,
        rotation_deg DECIMAL(5,2) NOT NULL CONSTRAINT DF_asset_placement_rotation DEFAULT (0),
        valid_from   DATE NOT NULL CONSTRAINT DF_asset_placement_from DEFAULT (CAST(SYSUTCDATETIME() AS DATE)),
        valid_to     DATE NULL,                             -- NULL = currently in effect
        created_by   INT NOT NULL,
        note         NVARCHAR(1000) NULL,
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_asset_placement_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_asset_placement_rotation CHECK (rotation_deg >= 0 AND rotation_deg < 360),
        CONSTRAINT CK_asset_placement_range CHECK (valid_to IS NULL OR valid_to >= valid_from),
        CONSTRAINT FK_asset_placement_layout FOREIGN KEY (layout_id)
            REFERENCES production.plant_layout (layout_id), -- no cascade: preserve history
        CONSTRAINT FK_asset_placement_asset FOREIGN KEY (asset_id)
            REFERENCES maint.asset (asset_id),              -- no cascade: preserve history if asset retired
        CONSTRAINT FK_asset_placement_created_by FOREIGN KEY (created_by)
            REFERENCES auth.app_user (user_id)              -- no cascade: preserve authorship history
    );

    -- "What is on layout X now / over time" and "where has asset Y been"
    CREATE INDEX IX_asset_placement_layout ON production.asset_placement (layout_id, valid_from);
    CREATE INDEX IX_asset_placement_asset  ON production.asset_placement (asset_id, valid_from);

    -- One CURRENT placement per (layout, asset). Also the fast path for
    -- "everything currently on layout X" (leading column + tiny filtered set).
    CREATE UNIQUE INDEX UQ_asset_placement_current
        ON production.asset_placement (layout_id, asset_id)
        WHERE valid_to IS NULL;
END
GO

-- ---------------------------------------------------------------------------
-- Nav: one item under the existing 'production' section (V11), same guarded
-- pattern as V9/V11. Icon note: 'Map' must be added to the curated NavIcon map
-- (src/modules/navigation/icons.tsx) by this plan's build step.
-- ---------------------------------------------------------------------------
INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Layout', N'Map', N'/production/layout', 30
FROM auth.nav_section s
WHERE s.code = N'production'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item i
                  WHERE i.section_id = s.section_id AND i.href = N'/production/layout');
GO

-- ---------------------------------------------------------------------------
-- RBAC: layout/footprint/placement permissions, same pattern as V8/V11.
-- Matched by code. No role_permission seeds: admin bypasses at app layer
-- (ADR 0004). layout:activate covers the paired archive-the-previous-active
-- transition; layout:archive is retiring an active layout WITHOUT a successor.
-- ---------------------------------------------------------------------------
MERGE auth.permission AS tgt
USING (VALUES
    (N'production.layout:create',    N'Upload a plant layout (new draft version)'),
    (N'production.layout:activate',  N'Activate a draft layout (archives the previous active version)'),
    (N'production.layout:archive',   N'Archive the active plant layout without a replacement'),
    (N'production.footprint:manage', N'Create and edit asset footprints'),
    (N'production.placement:create', N'Place an asset on a plant layout'),
    (N'production.placement:close',  N'Close (end) an asset placement')
) AS src (code, description)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, description) VALUES (src.code, src.description);
GO
