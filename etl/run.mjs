// EPS -> EBI.staging ETL for the laser-cut sequencing module.
//
// Runs on-prem (plant LAN) on any always-on Windows box that can reach BOTH
// EPS SQL Server (192.168.4.5, READ-ONLY — hard rule #3, never written) and
// the EBI Azure SQL database as the ebi_etl login. The Next.js portal CANNOT
// reach EPS; this standalone script is the only bridge. See etl/README.md.
//
//   pnpm etl:run            (node --env-file=.env etl/run.mjs)
//
// Each run lands the laser-cut domain (Plant 1 / route 9) into staging.*:
//   eps_nesting        open window + recent closures/cancellations (hash-skip)
//   eps_nesting_detail components of those nestings (hash-skip)
//   eps_nesting_plan   the active EPS sequence row per nesting (upsert)
//   eps_cutting_station the ~9 laser stations (full refresh)
//   eps_part_route_step downstream route of parts present in open nestings
// and writes one etl.run_log row per entity (status, rows_loaded, watermark).

import { Connection, Request, TYPES } from "tedious";
import { SCOPE, rowHash, buildMergeSql, maxWatermark } from "./lib/transform.mjs";

// ---------------------------------------------------------------------------
// Env / connection config
// ---------------------------------------------------------------------------
const req = (name) => {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable ${name}. See etl/README.md`);
  }
  return v;
};
const flag = (name, dflt) => {
  const v = process.env[name];
  if (v === undefined || v === "") return dflt;
  return v.toLowerCase() === "true";
};

// EPS source: on-prem SQL Server, read-only login. Typically unencrypted on the
// LAN (EPS_SQL_ENCRYPT defaults false); set true + a trusted cert if required.
function epsConfig() {
  const encrypt = flag("EPS_SQL_ENCRYPT", false);
  return {
    server: req("EPS_SQL_SERVER"),
    authentication: {
      type: "default",
      options: { userName: req("EPS_SQL_USER"), password: req("EPS_SQL_PASSWORD") },
    },
    options: {
      database: req("EPS_SQL_DATABASE"), // "EPS"
      port: Number(process.env.EPS_SQL_PORT ?? 1433),
      encrypt,
      trustServerCertificate: !encrypt,
      rowCollectionOnRequestCompletion: false,
      requestTimeout: 60_000,
    },
  };
}

// EBI target: SAME Azure SQL server/database as the portal (reuses DB_SERVER /
// DB_DATABASE), only a different login — ebi_etl (CRUD on staging, write on
// etl.run_log) instead of the app's ebi_app.
function ebiConfig() {
  const encrypt = flag("EBI_ETL_ENCRYPT", true);
  return {
    server: req("DB_SERVER"),
    authentication: {
      type: "default",
      options: { userName: req("EBI_ETL_USER"), password: req("EBI_ETL_PASSWORD") },
    },
    options: {
      database: req("DB_DATABASE"),
      port: Number(process.env.EBI_ETL_PORT ?? 1433),
      encrypt,
      trustServerCertificate: !encrypt,
      rowCollectionOnRequestCompletion: false,
      requestTimeout: 60_000,
    },
  };
}

// ---------------------------------------------------------------------------
// tedious promise wrappers
// ---------------------------------------------------------------------------
function connect(config) {
  return new Promise((resolve, reject) => {
    const c = new Connection(config);
    c.on("connect", (err) => (err ? reject(err) : resolve(c)));
    c.connect();
  });
}

function query(conn, sql, params = []) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const request = new Request(sql, (err) => (err ? reject(err) : resolve(rows)));
    for (const p of params) request.addParameter(p.name, p.type, p.value);
    request.on("row", (columns) => {
      const o = {};
      for (const col of columns) o[col.metadata.colName] = col.value;
      rows.push(o);
    });
    conn.execSql(request);
  });
}

// A landed batch: MERGE @json then SELECT @@ROWCOUNT. Returns affected rows.
async function merge(conn, sql, rows) {
  if (rows.length === 0) return 0;
  const out = await query(conn, sql, [
    { name: "json", type: TYPES.NVarChar, value: JSON.stringify(rows) },
  ]);
  return out.length ? Number(out[0].affected ?? 0) : 0;
}

// ---------------------------------------------------------------------------
// run_log helpers (etl schema)
// ---------------------------------------------------------------------------
async function startRun(ebi, entity) {
  const rows = await query(
    ebi,
    "INSERT INTO etl.run_log (entity, status) OUTPUT INSERTED.run_id AS run_id VALUES (@entity, 'running');",
    [{ name: "entity", type: TYPES.VarChar, value: entity }],
  );
  return Number(rows[0].run_id);
}

async function finishRun(ebi, runId, { status, rows, watermark, message }) {
  await query(
    ebi,
    `UPDATE etl.run_log
       SET status = @status, rows_loaded = @rows, watermark = @watermark,
           message = @message, finished_at = SYSUTCDATETIME()
     WHERE run_id = @runId;`,
    [
      { name: "status", type: TYPES.VarChar, value: status },
      { name: "rows", type: TYPES.Int, value: rows ?? null },
      { name: "watermark", type: TYPES.NVarChar, value: watermark ?? null },
      { name: "message", type: TYPES.NVarChar, value: message ?? null },
      { name: "runId", type: TYPES.Int, value: runId },
    ],
  );
}

async function isFirstNestingRun(ebi) {
  const rows = await query(
    ebi,
    "SELECT COUNT(*) AS c FROM etl.run_log WHERE entity = 'eps_nesting' AND status = 'success';",
  );
  return Number(rows[0].c) === 0;
}

// ---------------------------------------------------------------------------
// Column specs (staging target) + row mappers (EPS source -> landed row)
// ---------------------------------------------------------------------------
const NESTING_SPEC = {
  schema: "staging",
  table: "eps_nesting",
  keys: ["eps_nesting_id"],
  hash: true,
  cols: [
    { name: "eps_nesting_id", sql: "INT" },
    { name: "eps_plant_id", sql: "INT" },
    { name: "eps_route_id", sql: "INT" },
    { name: "eps_station_id", sql: "INT" },
    { name: "program_name", sql: "NVARCHAR(35)" },
    { name: "plate_material_id", sql: "INT" },
    { name: "plate_material_code", sql: "NVARCHAR(1000)" },
    { name: "plate_material_name", sql: "NVARCHAR(1000)" },
    { name: "plate_count", sql: "INT" },
    { name: "cut_minutes", sql: "DECIMAL(12,2)" },
    { name: "scrap_pct", sql: "DECIMAL(5,2)" },
    { name: "is_kanban", sql: "BIT" },
    { name: "eps_priority", sql: "INT" },
    { name: "finished_count", sql: "INT" },
    { name: "heat_lot", sql: "NVARCHAR(100)" },
    { name: "eps_created_at", sql: "DATETIME2(3)" },
    { name: "material_requested_at", sql: "DATETIME2(3)" },
    { name: "material_issued_at", sql: "DATETIME2(3)" },
    { name: "started_at", sql: "DATETIME2(3)" },
    { name: "finished_at", sql: "DATETIME2(3)" },
    { name: "is_deleted", sql: "BIT" },
    { name: "deleted_at", sql: "DATETIME2(3)" },
  ],
};

const DETAIL_SPEC = {
  schema: "staging",
  table: "eps_nesting_detail",
  keys: ["eps_nesting_id", "line_no"],
  hash: true,
  cols: [
    { name: "eps_nesting_id", sql: "INT" },
    { name: "line_no", sql: "INT" },
    { name: "part_material_id", sql: "INT" },
    { name: "part_code", sql: "NVARCHAR(1000)" },
    { name: "part_name", sql: "NVARCHAR(1000)" },
    { name: "quantity", sql: "INT" },
    { name: "wip_quantity", sql: "INT" },
    { name: "wip_released_quantity", sql: "INT" },
    { name: "rejected_quantity", sql: "INT" },
  ],
};

const PLAN_SPEC = {
  schema: "staging",
  table: "eps_nesting_plan",
  keys: ["eps_nesting_id"],
  hash: false,
  cols: [
    { name: "eps_nesting_id", sql: "INT" },
    { name: "plan_no", sql: "INT" },
    { name: "sequence_no", sql: "INT" },
    { name: "planned_date", sql: "DATETIME2(3)" },
    { name: "shift", sql: "INT" },
    { name: "eps_created_at", sql: "DATETIME2(3)" },
  ],
};

const STATION_SPEC = {
  schema: "staging",
  table: "eps_cutting_station",
  keys: ["eps_plant_id", "eps_route_id", "eps_station_id"],
  hash: false,
  cols: [
    { name: "eps_plant_id", sql: "INT" },
    { name: "eps_route_id", sql: "INT" },
    { name: "eps_station_id", sql: "INT" },
    { name: "eps_process_id", sql: "INT" },
    { name: "description", sql: "NVARCHAR(60)" },
    { name: "available_hours", sql: "DECIMAL(5,2)" },
    { name: "serial_no", sql: "NVARCHAR(100)" },
    { name: "is_deleted", sql: "BIT" },
  ],
};

const ROUTE_STEP_SPEC = {
  schema: "staging",
  table: "eps_part_route_step",
  keys: ["part_material_id", "eps_route_id"],
  hash: false,
  cols: [
    { name: "part_material_id", sql: "INT" },
    { name: "eps_route_id", sql: "INT" },
    { name: "fabrication_order", sql: "INT" },
    { name: "eps_process_id", sql: "INT" },
    { name: "route_name", sql: "NVARCHAR(200)" },
    { name: "process_name", sql: "NVARCHAR(200)" },
    { name: "process_seconds", sql: "INT" },
    { name: "setup_seconds", sql: "INT" },
    { name: "eps_plant_id", sql: "INT" },
  ],
};

// Value columns (non-key) in a fixed order, used to compute row_hash.
const hashCols = (spec) => spec.cols.map((c) => c.name).filter((n) => !spec.keys.includes(n));

function toIso(v) {
  return v instanceof Date ? v.toISOString() : v ?? null;
}
function toBit(v) {
  if (v === null || v === undefined) return null;
  return v ? 1 : 0;
}

// ---------------------------------------------------------------------------
// EPS extract queries. The nesting predicate re-reads the full open window
// every run; @includeClosures adds recent closures/cancellations computed off
// EPS's own GETDATE() (avoids cross-server clock skew). On the FIRST run
// closures are excluded so the initial load is the open window only (~294),
// never the 285k historic nestings.
// ---------------------------------------------------------------------------
const NESTING_PREDICATE = `
  n.idPlanta = @plant AND n.idRuta = @route
  AND (
        (n.FechaFin IS NULL AND ISNULL(n.bDeleted, 0) = 0)
     OR (@includeClosures = 1 AND n.FechaFin  >= DATEADD(DAY, -@lookback, CAST(GETDATE() AS DATE)))
     OR (@includeClosures = 1 AND n.FechaBaja >= DATEADD(DAY, -@lookback, CAST(GETDATE() AS DATE)))
  )`;

function scopeParams(includeClosures) {
  return [
    { name: "plant", type: TYPES.Int, value: SCOPE.plantId },
    { name: "route", type: TYPES.Int, value: SCOPE.routeId },
    { name: "includeClosures", type: TYPES.Bit, value: includeClosures ? 1 : 0 },
    { name: "lookback", type: TYPES.Int, value: SCOPE.closureLookbackDays },
  ];
}

async function extractNestings(eps, includeClosures) {
  const rows = await query(
    eps,
    `SELECT n.idNesteo, n.idPlanta, n.idRuta, n.idEstacion, n.Nesteo,
            n.idPlaca, m.ClaveMaterial, m.Descripcion, n.CantidadPlacas, n.TiempoCorte,
            n.Scrap, n.EsKanban, n.PrioridadNesteo, n.CantidadTerminada, n.Colada,
            n.FechaCreacion, n.FechaSolicitud, n.FechaSurtido, n.FechaInicio, n.FechaFin,
            ISNULL(n.bDeleted, 0) AS bDeleted, n.FechaBaja
       FROM dbo.tblNesteo n
       LEFT JOIN dbo.tblMaterial m ON m.idMaterial = n.idPlaca
      WHERE ${NESTING_PREDICATE};`,
    scopeParams(includeClosures),
  );
  return rows.map((r) => ({
    eps_nesting_id: r.idNesteo,
    eps_plant_id: r.idPlanta,
    eps_route_id: r.idRuta,
    eps_station_id: r.idEstacion,
    program_name: r.Nesteo,
    plate_material_id: r.idPlaca,
    plate_material_code: r.ClaveMaterial,
    plate_material_name: r.Descripcion,
    plate_count: r.CantidadPlacas,
    cut_minutes: r.TiempoCorte,
    scrap_pct: r.Scrap,
    is_kanban: toBit(r.EsKanban),
    eps_priority: r.PrioridadNesteo,
    finished_count: r.CantidadTerminada,
    heat_lot: r.Colada,
    eps_created_at: toIso(r.FechaCreacion),
    material_requested_at: toIso(r.FechaSolicitud),
    material_issued_at: toIso(r.FechaSurtido),
    started_at: toIso(r.FechaInicio),
    finished_at: toIso(r.FechaFin),
    is_deleted: toBit(r.bDeleted),
    deleted_at: toIso(r.FechaBaja),
  }));
}

async function extractDetails(eps, includeClosures) {
  const rows = await query(
    eps,
    `SELECT d.idNesteo, d.No, d.PartNumber, mm.ClaveMaterial, mm.Descripcion,
            d.Cantidad, d.CantidadWip, d.CantidadWipLiberada, d.CantidadRechazada
       FROM dbo.tblNesteoDetail d
       JOIN dbo.tblNesteo n ON n.idNesteo = d.idNesteo
       LEFT JOIN dbo.tblMaterial mm ON mm.idMaterial = d.PartNumber
      WHERE ${NESTING_PREDICATE};`,
    scopeParams(includeClosures),
  );
  return rows.map((r) => ({
    eps_nesting_id: r.idNesteo,
    line_no: r.No,
    part_material_id: r.PartNumber,
    part_code: r.ClaveMaterial,
    part_name: r.Descripcion,
    quantity: r.Cantidad,
    wip_quantity: r.CantidadWip,
    wip_released_quantity: r.CantidadWipLiberada,
    rejected_quantity: r.CantidadRechazada,
  }));
}

async function extractPlans(eps, includeClosures) {
  const rows = await query(
    eps,
    `SELECT p.idNesteo, p.NoPlan, p.OrdenNesteo, p.Fecha, p.Turno, p.FechaCreacion
       FROM dbo.tblNesteoPlan p
       JOIN dbo.tblNesteo n ON n.idNesteo = p.idNesteo
      WHERE p.bPlanActivo = 1 AND ${NESTING_PREDICATE};`,
    scopeParams(includeClosures),
  );
  return rows.map((r) => ({
    eps_nesting_id: r.idNesteo,
    plan_no: r.NoPlan,
    sequence_no: r.OrdenNesteo,
    planned_date: toIso(r.Fecha),
    shift: r.Turno,
    eps_created_at: toIso(r.FechaCreacion),
  }));
}

async function extractStations(eps) {
  // Station catalog lives in the PLANEACION schema (has HorasDisponibles /
  // NoSerie / bDeleted); the MRP.tblEstacionRuta table is a different shape and
  // must NOT be used. Route 9 already excludes the IdRuta = 0 duplicates.
  const rows = await query(
    eps,
    `SELECT e.idPlanta, e.IdRuta, e.IdEstacion, e.IdProceso, e.EstacionDescripcion,
            e.HorasDisponibles, e.NoSerie, ISNULL(e.bDeleted, 0) AS bDeleted
       FROM PLANEACION.tblEstacionRuta e
      WHERE e.idPlanta = @plant AND e.IdRuta = @route;`,
    [
      { name: "plant", type: TYPES.Int, value: SCOPE.plantId },
      { name: "route", type: TYPES.Int, value: SCOPE.routeId },
    ],
  );
  return rows.map((r) => ({
    eps_plant_id: r.idPlanta,
    eps_route_id: r.IdRuta,
    eps_station_id: r.IdEstacion,
    eps_process_id: r.IdProceso,
    description: r.EstacionDescripcion,
    available_hours: r.HorasDisponibles,
    serial_no: r.NoSerie,
    is_deleted: toBit(r.bDeleted),
  }));
}

async function extractRouteSteps(eps) {
  // Downstream route for every part present in the CURRENT open window. Uses
  // the open-window subquery directly (route steps are static reference data;
  // no need to widen with closures).
  const rows = await query(
    eps,
    `SELECT rt.idMaterial, rt.idRuta, rt.OrdenFabricacion, r.idProceso,
            r.Nombre AS route_name, pr.Nombre AS process_name,
            rt.TiempoProceso, rt.TiempoSetup, rt.IdPlanta
       FROM dbo.tblMaterialRutaTiempo rt
       LEFT JOIN dbo.tblRuta r ON r.idRuta = rt.idRuta
       LEFT JOIN dbo.tblProceso pr ON pr.idProceso = r.idProceso
      WHERE rt.idMaterial IN (
              SELECT DISTINCT d.PartNumber
                FROM dbo.tblNesteoDetail d
                JOIN dbo.tblNesteo n ON n.idNesteo = d.idNesteo
               WHERE n.idPlanta = @plant AND n.idRuta = @route
                 AND n.FechaFin IS NULL AND ISNULL(n.bDeleted, 0) = 0
            );`,
    [
      { name: "plant", type: TYPES.Int, value: SCOPE.plantId },
      { name: "route", type: TYPES.Int, value: SCOPE.routeId },
    ],
  );
  return rows.map((r) => ({
    part_material_id: r.idMaterial,
    eps_route_id: r.idRuta,
    fabrication_order: r.OrdenFabricacion,
    eps_process_id: r.idProceso,
    route_name: r.route_name,
    process_name: r.process_name,
    process_seconds: r.TiempoProceso,
    setup_seconds: r.TiempoSetup,
    eps_plant_id: r.IdPlanta,
  }));
}

// Attach a row_hash string to every row of a hashed batch.
function withHash(spec, rows) {
  const cols = hashCols(spec);
  return rows.map((r) => ({ ...r, row_hash: rowHash(cols.map((c) => r[c])) }));
}

// ---------------------------------------------------------------------------
// Per-entity pipeline: start run_log -> extract -> merge -> finish run_log.
// One failing entity is logged and does not abort the others.
// ---------------------------------------------------------------------------
async function runEntity(ebi, entity, produce, spec, idKey) {
  const runId = await startRun(ebi, entity);
  try {
    let rows = await produce();
    if (spec.hash) rows = withHash(spec, rows);
    const affected = await merge(ebi, buildMergeSql(spec), rows);
    const watermark = idKey ? maxWatermark(rows, idKey) : null;
    await finishRun(ebi, runId, { status: "success", rows: affected, watermark });
    console.log(`[${entity}] read ${rows.length}, wrote ${affected}` + (watermark ? `, watermark ${watermark}` : ""));
    return { entity, ok: true, read: rows.length, wrote: affected };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(ebi, runId, { status: "error", message }).catch(() => {});
    console.error(`[${entity}] FAILED: ${message}`);
    return { entity, ok: false, error: message };
  }
}

async function main() {
  const started = Date.now();
  let eps;
  let ebi;
  try {
    [eps, ebi] = await Promise.all([connect(epsConfig()), connect(ebiConfig())]);
  } catch (err) {
    console.error(`Connection failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  const firstRun = await isFirstNestingRun(ebi);
  const includeClosures = !firstRun;
  if (firstRun) console.log("First run detected: loading the open window only (no closures backfill).");

  const results = [];
  results.push(await runEntity(ebi, "eps_nesting", () => extractNestings(eps, includeClosures), NESTING_SPEC, "eps_nesting_id"));
  results.push(await runEntity(ebi, "eps_nesting_detail", () => extractDetails(eps, includeClosures), DETAIL_SPEC));
  results.push(await runEntity(ebi, "eps_nesting_plan", () => extractPlans(eps, includeClosures), PLAN_SPEC));
  results.push(await runEntity(ebi, "eps_cutting_station", () => extractStations(eps), STATION_SPEC));
  results.push(await runEntity(ebi, "eps_part_route_step", () => extractRouteSteps(eps), ROUTE_STEP_SPEC));

  eps.close();
  ebi.close();

  const failed = results.filter((r) => !r.ok);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`ETL finished in ${secs}s — ${results.length - failed.length}/${results.length} entities ok.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
