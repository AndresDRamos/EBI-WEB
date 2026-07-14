-- V20__laser_cut_sequencing.sql
-- Module laser-cut-sequencing (Plant 1 laser-cut nesting panel + per-machine
-- sequence programs).
--   staging.* : faithful, domain-scoped EPS landing (written ONLY by the ETL,
--               read-only for the portal). Natural EPS keys, NO identity, NO
--               FKs to app schemas (integrity is EPS's; staging is a replica).
--               Contract: MERGE targets, NEVER truncated in normal operation
--               (planning.machine_program_entry references eps_nesting_id
--               logically).
--   planning  : NEW schema, portal-owned (ebi_app CRUD) — sequence programs
--               per cell + EBI cell <-> EPS station mapping.
-- EPS source facts verified 2026-07 (sqlserver-eps, read-only): tblNesteo PK
-- idNesteo; no rowversion/FechaModificacion -> ETL = new-ids watermark +
-- full re-extract of the open window (FechaFin IS NULL, ~294 rows plant 1 /
-- route 9) + closures by FechaFin >= last run. EPS datetimes land as
-- DATETIME2(3) (preserves datetime's 3.33 ms precision for watermark math);
-- portal-owned audit columns stay DATETIME2(0) (house style).
-- Landing tolerance: staging columns are NULL-able even where EPS is NOT NULL
-- today (a landing table must not reject source rows), EXCEPT: the natural
-- keys, eps_created_at (verified NOT NULL) and is_deleted (normalized
-- ISNULL(bDeleted,0) at load because it participates in filtered indexes).
-- NO destructive/irreversible operations: everything below is additive.
-- Nav + RBAC seeds follow V7/V8/V9/V19 house patterns. Section 'planning'
-- ships is_active = 0 (dark launch, V7 precedent with 'maintenance').
-- Grants: ebi_app = SELECT on staging/etl + CRUD on planning;
-- ebi_agent_ro = SELECT; ebi_etl (created by a human BEFORE this migration
-- runs — done in EBI_dev 2026-07-14; required in EBI before the human
-- production run) = CRUD on staging + write on etl.run_log.
-- FKs are NO ACTION unless noted; updated_at app-maintained (no triggers).
-- Target: Azure SQL (EBI_dev / EBI). Applied by ebi_migrator.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- 0) Schema planning (staging/etl already exist since V2)
-- ---------------------------------------------------------------------------
IF SCHEMA_ID(N'planning') IS NULL EXEC(N'CREATE SCHEMA planning');
GO

-- ===========================================================================
-- A) STAGING — faithful EPS landing, laser-cut domain
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A1) staging.eps_nesting — 1:1 with EPS dbo.tblNesteo (useful subset + full
--     lifecycle state). PK = natural EPS id, NO identity. Denormalizes the
--     plate material code/name (source declares varchar(1000); kept faithful,
--     never indexed). row_hash = ETL-computed SHA2_256 over the landed
--     columns for cheap change detection in the open-window re-extract.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'staging.eps_nesting', N'U') IS NULL
BEGIN
    CREATE TABLE staging.eps_nesting
    (
        eps_nesting_id        INT            NOT NULL CONSTRAINT PK_eps_nesting PRIMARY KEY,  -- = tblNesteo.idNesteo
        eps_plant_id          INT            NOT NULL,                -- idPlanta (ETL scope requires it)
        eps_route_id          INT            NOT NULL,                -- idRuta (9 = laser cut)
        eps_station_id        INT            NULL,                    -- idEstacion
        program_name          NVARCHAR(35)   NULL,                    -- Nesteo (NOT unique in EPS)
        plate_material_id     INT            NULL,                    -- idPlaca -> tblMaterial
        plate_material_code   NVARCHAR(1000) NULL,                    -- tblMaterial.ClaveMaterial (denormalized)
        plate_material_name   NVARCHAR(1000) NULL,                    -- tblMaterial.Descripcion (denormalized)
        plate_count           INT            NULL,                    -- CantidadPlacas (0 happens)
        cut_minutes           DECIMAL(12,2)  NULL,                    -- TiempoCorte (MINUTES)
        scrap_pct             DECIMAL(5,2)   NULL,                    -- Scrap
        is_kanban             BIT            NULL,                    -- EsKanban
        eps_priority          INT            NULL,                    -- PrioridadNesteo
        finished_count        INT            NULL,                    -- CantidadTerminada
        heat_lot              NVARCHAR(100)  NULL,                    -- Colada
        eps_created_at        DATETIME2(3)   NOT NULL,                -- FechaCreacion (EPS NOT NULL, verified)
        material_requested_at DATETIME2(3)   NULL,                    -- FechaSolicitud
        material_issued_at    DATETIME2(3)   NULL,                    -- FechaSurtido
        started_at            DATETIME2(3)   NULL,                    -- FechaInicio
        finished_at           DATETIME2(3)   NULL,                    -- FechaFin (NULL = pending/open)
        is_deleted            BIT            NOT NULL CONSTRAINT DF_eps_nesting_deleted DEFAULT (0),  -- ISNULL(bDeleted,0) at load
        deleted_at            DATETIME2(3)   NULL,                    -- FechaBaja
        row_hash              VARBINARY(32)  NULL,                    -- ETL SHA2_256 change detection
        loaded_at             DATETIME2(0)   NOT NULL CONSTRAINT DF_eps_nesting_loaded DEFAULT (SYSUTCDATETIME())
    );

    -- Panel workhorse: open nestings of a plant/route (today ~294 rows for
    -- plant 1 / route 9). Filtered on the open window so it stays tiny and
    -- rows fall OUT of it when finished_at is set (cheap ETL updates).
    CREATE INDEX IX_eps_nesting_open
        ON staging.eps_nesting (eps_plant_id, eps_route_id, eps_station_id)
        INCLUDE (program_name, plate_count, cut_minutes, eps_priority,
                 eps_created_at, material_requested_at, material_issued_at, started_at)
        WHERE finished_at IS NULL AND is_deleted = 0;

    -- "Recently finished" views (panel history / closure audits).
    CREATE INDEX IX_eps_nesting_finished
        ON staging.eps_nesting (eps_plant_id, eps_route_id, finished_at DESC)
        WHERE finished_at IS NOT NULL;
END
GO

-- ---------------------------------------------------------------------------
-- A2) staging.eps_nesting_detail — 1:1 with tblNesteoDetail. Composite natural
--     PK (nesting, line). The PK alone serves the panel's per-nesting lookup.
--     No FK to eps_nesting on purpose (staging tables merge independently;
--     ordering guarantees would complicate the ETL for zero app benefit).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'staging.eps_nesting_detail', N'U') IS NULL
BEGIN
    CREATE TABLE staging.eps_nesting_detail
    (
        eps_nesting_id        INT            NOT NULL,               -- idNesteo
        line_no               INT            NOT NULL,               -- No
        part_material_id      INT            NOT NULL,               -- PartNumber (= component idMaterial)
        part_code             NVARCHAR(1000) NULL,                   -- tblMaterial.ClaveMaterial (denormalized)
        part_name             NVARCHAR(1000) NULL,                   -- tblMaterial.Descripcion (denormalized)
        quantity              INT            NULL,                   -- Cantidad
        wip_quantity          INT            NULL,                   -- CantidadWip
        wip_released_quantity INT            NULL,                   -- CantidadWipLiberada
        rejected_quantity     INT            NULL,                   -- CantidadRechazada
        row_hash              VARBINARY(32)  NULL,
        loaded_at             DATETIME2(0)   NOT NULL CONSTRAINT DF_eps_nesting_detail_loaded DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_eps_nesting_detail PRIMARY KEY (eps_nesting_id, line_no)
    );
END
GO

-- ---------------------------------------------------------------------------
-- A3) staging.eps_nesting_plan — ONLY the current EPS sequence row per nesting
--     (tblNesteoPlan WHERE bPlanActivo = 1) -> PK = eps_nesting_id alone.
--     Deliberately not full history: the portal only needs "what EPS says
--     today" to compare against planning.machine_program; the audit trail
--     lives in EPS. plan_no is kept for traceability back to tblNesteoPlan.
--     ETL: upsert by PK; if the active row changes NoPlan, the same PK row is
--     overwritten (delete-then-insert also fine).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'staging.eps_nesting_plan', N'U') IS NULL
BEGIN
    CREATE TABLE staging.eps_nesting_plan
    (
        eps_nesting_id INT          NOT NULL CONSTRAINT PK_eps_nesting_plan PRIMARY KEY,
        plan_no        INT          NOT NULL,                        -- NoPlan (active row)
        sequence_no    INT          NULL,                            -- OrdenNesteo
        planned_date   DATETIME2(3) NULL,                            -- Fecha
        shift          INT          NULL,                            -- Turno (domain 1..3 verified in EPS)
        eps_created_at DATETIME2(3) NULL,                            -- FechaCreacion
        loaded_at      DATETIME2(0) NOT NULL CONSTRAINT DF_eps_nesting_plan_loaded DEFAULT (SYSUTCDATETIME())
    );
END
GO

-- ---------------------------------------------------------------------------
-- A4) staging.eps_cutting_station — Planeacion.tblEstacionRuta, laser scope.
--     PK (plant, route, station): that is the tuple tblNesteo carries and the
--     tuple planning.cell_station_link resolves. Verified unique for real
--     routes — EPS duplicates exist only where IdRuta = 0, which the ETL
--     excludes by contract. eps_process_id is landed as a plain column.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'staging.eps_cutting_station', N'U') IS NULL
BEGIN
    CREATE TABLE staging.eps_cutting_station
    (
        eps_plant_id    INT           NOT NULL,                      -- idPlanta
        eps_route_id    INT           NOT NULL,                      -- IdRuta (never 0: ETL contract)
        eps_station_id  INT           NOT NULL,                      -- IdEstacion
        eps_process_id  INT           NULL,                          -- IdProceso (informational)
        description     NVARCHAR(60)  NULL,                          -- EstacionDescripcion
        available_hours DECIMAL(5,2)  NULL,                          -- HorasDisponibles
        serial_no       NVARCHAR(100) NULL,                          -- NoSerie
        is_deleted      BIT           NOT NULL CONSTRAINT DF_eps_cutting_station_deleted DEFAULT (0),
        loaded_at       DATETIME2(0)  NOT NULL CONSTRAINT DF_eps_cutting_station_loaded DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_eps_cutting_station PRIMARY KEY (eps_plant_id, eps_route_id, eps_station_id)
    );
END
GO

-- ---------------------------------------------------------------------------
-- A5) staging.eps_part_route_step — tblMaterialRutaTiempo for parts present in
--     nesting details (post-laser routing). PK mirrors the EPS PK
--     (idMaterial, idRuta). The panel reads "route of part X ordered by
--     fabrication_order": PK prefix seek + tiny sort (~10 rows) — no extra
--     index. process_seconds is SECONDS at source (cut_minutes above is
--     MINUTES — do NOT homogenize in staging; convert in the read layer).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'staging.eps_part_route_step', N'U') IS NULL
BEGIN
    CREATE TABLE staging.eps_part_route_step
    (
        part_material_id  INT           NOT NULL,                    -- idMaterial
        eps_route_id      INT           NOT NULL,                    -- idRuta
        fabrication_order INT           NULL,                        -- OrdenFabricacion (10,20,...,999=shipping)
        eps_process_id    INT           NULL,                        -- via tblRuta.idProceso
        route_name        NVARCHAR(200) NULL,                        -- tblRuta name (denormalized)
        process_name      NVARCHAR(200) NULL,                        -- tblProceso name (denormalized)
        process_seconds   INT           NULL,                        -- TiempoProceso (SECONDS)
        setup_seconds     INT           NULL,                        -- TiempoSetup (NULLs at source)
        eps_plant_id      INT           NULL,                        -- IdPlanta
        loaded_at         DATETIME2(0)  NOT NULL CONSTRAINT DF_eps_part_route_step_loaded DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_eps_part_route_step PRIMARY KEY (part_material_id, eps_route_id)
    );
END
GO

-- ===========================================================================
-- B) PLANNING — portal-owned sequence programs
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B1) planning.cell_station_link — EBI cell <-> EPS station mapping. 1:1 both
--     ways: a cell maps to at most one station (UQ cell) and a station to at
--     most one cell (UQ natural tuple). Real cross-schema FK to
--     production.cell (maint -> org precedent); NO FK to staging (replica).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'planning.cell_station_link', N'U') IS NULL
BEGIN
    CREATE TABLE planning.cell_station_link
    (
        cell_station_link_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_cell_station_link PRIMARY KEY,
        cell_id              INT NOT NULL,
        eps_plant_id         INT NOT NULL,
        eps_route_id         INT NOT NULL,
        eps_station_id       INT NOT NULL,
        created_at           DATETIME2(0) NOT NULL CONSTRAINT DF_cell_station_link_created DEFAULT (SYSUTCDATETIME()),
        updated_at           DATETIME2(0) NOT NULL CONSTRAINT DF_cell_station_link_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_cell_station_link_cell    UNIQUE (cell_id),
        CONSTRAINT UQ_cell_station_link_station UNIQUE (eps_plant_id, eps_route_id, eps_station_id),
        CONSTRAINT FK_cell_station_link_cell FOREIGN KEY (cell_id)
            REFERENCES production.cell (cell_id)              -- no cascade: protect catalog (app 409s)
    );
END
GO

-- ---------------------------------------------------------------------------
-- B2) planning.machine_program — a sequence program for one cell on one date
--     (optionally one shift). Lifecycle: draft -> published -> archived
--     (V13 plant_layout precedent; archived keeps history without deletes).
--     Filtered unique: at most ONE published program per (cell, date, shift).
--     NOTE: SQL Server unique indexes treat NULLs as equal -> at most one
--     published NULL-shift ("whole day") program per cell/date. Intended.
--     No 'name' column in v1: identity = cell + date + shift.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'planning.machine_program', N'U') IS NULL
BEGIN
    CREATE TABLE planning.machine_program
    (
        machine_program_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_machine_program PRIMARY KEY,
        cell_id            INT            NOT NULL,
        program_date       DATE           NOT NULL,
        shift              INT            NULL,
        status             NVARCHAR(20)   NOT NULL CONSTRAINT DF_machine_program_status DEFAULT (N'draft'),
        notes              NVARCHAR(1000) NULL,
        created_by         INT            NOT NULL,
        created_at         DATETIME2(0)   NOT NULL CONSTRAINT DF_machine_program_created DEFAULT (SYSUTCDATETIME()),
        updated_at         DATETIME2(0)   NOT NULL CONSTRAINT DF_machine_program_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_machine_program_status CHECK (status IN (N'draft', N'published', N'archived')),
        CONSTRAINT CK_machine_program_shift  CHECK (shift IS NULL OR shift IN (1, 2, 3)),  -- EPS Turno domain, verified
        CONSTRAINT FK_machine_program_cell FOREIGN KEY (cell_id)
            REFERENCES production.cell (cell_id),             -- no cascade: protect catalog
        CONSTRAINT FK_machine_program_created_by FOREIGN KEY (created_by)
            REFERENCES auth.app_user (user_id)                -- no cascade: authorship history
    );

    CREATE UNIQUE INDEX UQ_machine_program_published
        ON planning.machine_program (cell_id, program_date, shift)
        WHERE status = N'published';

    CREATE INDEX IX_machine_program_cell
        ON planning.machine_program (cell_id, program_date DESC);
END
GO

-- ---------------------------------------------------------------------------
-- B3) planning.machine_program_entry — ordered nestings inside a program.
--     Composite natural PK (program, nesting) + UNIQUE (program, sequence_no):
--     both invariants live in the DB, no identity needed. eps_nesting_id has
--     deliberately NO FK to staging.eps_nesting: staging is an ETL-owned
--     replica (a re-baseline must not be blocked by app rows); existence is
--     validated by the app at insert. Entries die with their program
--     (CASCADE — config owned by the parent, nav_item precedent).
--     Reorder recipe for the app: because of CK (> 0), use a POSITIVE offset
--     two-pass update (seq + 1000000, then final (i+1)*10) — negative temps
--     would violate the CHECK.
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'planning.machine_program_entry', N'U') IS NULL
BEGIN
    CREATE TABLE planning.machine_program_entry
    (
        machine_program_id INT NOT NULL,
        eps_nesting_id     INT NOT NULL,                      -- logical ref -> staging.eps_nesting (no FK, see above)
        sequence_no        INT NOT NULL,
        created_at         DATETIME2(0) NOT NULL CONSTRAINT DF_machine_program_entry_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_machine_program_entry PRIMARY KEY (machine_program_id, eps_nesting_id),
        CONSTRAINT UQ_machine_program_entry_sequence UNIQUE (machine_program_id, sequence_no),
        CONSTRAINT CK_machine_program_entry_sequence CHECK (sequence_no > 0),
        CONSTRAINT FK_machine_program_entry_program FOREIGN KEY (machine_program_id)
            REFERENCES planning.machine_program (machine_program_id) ON DELETE CASCADE
    );
END
GO

-- ===========================================================================
-- C) Nav + RBAC seeds (module owner = this migration; V7/V8/V9 patterns)
-- ===========================================================================

-- Section 'planning', dark launch (is_active = 0, V7 'maintenance' precedent).
-- Icons 'ClipboardCheck' (section) and 'Layers' (item) exist in the curated
-- NavIcon map (src/components/kit/nav-icon.tsx) — verified.
MERGE auth.nav_section AS tgt
USING (VALUES
    (N'planning', N'Planeación', N'ClipboardCheck', N'/planning', 40, 0)
) AS src (code, label, icon, base_path, sort_order, is_active)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, label, icon, base_path, sort_order, is_active)
    VALUES (src.code, src.label, src.icon, src.base_path, src.sort_order, src.is_active);
GO

INSERT INTO auth.nav_item (section_id, label, icon, href, sort_order)
SELECT s.section_id, N'Secuenciación láser', N'Layers', N'/planning/laser-sequencing', 10
FROM auth.nav_section AS s
WHERE s.code = N'planning'
  AND NOT EXISTS (SELECT 1 FROM auth.nav_item AS i
                  WHERE i.section_id = s.section_id
                    AND i.href = N'/planning/laser-sequencing');
GO

-- Permissions (mutations only; GETs stay on requireUser). NOTE: hyphen is
-- rejected by CK_permission_code_format -> 'station_link', not 'station-link'.
MERGE auth.permission AS tgt
USING (VALUES
    (N'planning.program:create',      N'Create laser sequence programs'),
    (N'planning.program:update',      N'Edit laser sequence programs (status, entries, order)'),
    (N'planning.program:delete',      N'Delete draft laser sequence programs'),
    (N'planning.station_link:manage', N'Manage EBI cell to EPS station links')
) AS src (code, description)
    ON tgt.code = src.code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, description) VALUES (src.code, src.description);
GO

-- ===========================================================================
-- D) Grants (least privilege; guarded, idempotent)
--    ebi_etl must exist BEFORE this migration runs (human step, per env);
--    if absent the grant is silently skipped and will NOT re-run (Flyway is
--    once-only) — see the plan's checklist.
-- ===========================================================================
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
BEGIN
    EXEC(N'GRANT SELECT ON SCHEMA::staging TO ebi_app');                       -- portal READS staging, never writes
    EXEC(N'GRANT SELECT ON SCHEMA::etl TO ebi_app');                           -- freshness indicator (run_log)
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::planning TO ebi_app');
END
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
BEGIN
    EXEC(N'GRANT SELECT ON SCHEMA::staging TO ebi_agent_ro');
    EXEC(N'GRANT SELECT ON SCHEMA::etl TO ebi_agent_ro');
    EXEC(N'GRANT SELECT ON SCHEMA::planning TO ebi_agent_ro');
END
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_etl') IS NOT NULL
BEGIN
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::staging TO ebi_etl'); -- DELETE: re-baseline capability
    EXEC(N'GRANT SELECT, INSERT, UPDATE ON SCHEMA::etl TO ebi_etl');             -- run_log writes; no DELETE (audit)
END
GO
