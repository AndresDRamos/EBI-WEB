/**
 * Portal-owned geometry model: the normalized JSON stored in
 * `production.plant_layout.geometry` / `production.asset_footprint.geometry`
 * (ADR 0006 — the DXF is archived, this JSON is what the portal renders).
 * Pure module — types + coordinate helpers, no I/O.
 */

export interface Point {
  x: number;
  y: number;
}

/** Closed region as an ordered vertex list (first vertex NOT repeated last). */
export type Ring = Point[];

export interface OpenPath {
  vertices: Point[];
  closed: boolean;
}

export type ColumnShape =
  | { kind: "polygon"; vertices: Ring }
  | { kind: "circle"; center: Point; radius_m: number };

export interface Zone {
  label: string | null;
  polygon: Ring;
}

export type PortKind = "in" | "out";

export interface Port {
  kind: PortKind;
  x: number;
  y: number;
  /** Direction the port points at, degrees CCW from +X (AutoCAD convention). */
  direction_deg: number;
  label: string;
}

/** Normalized plant layout: meters, origin (0,0) at the outline bbox minimum. */
export interface LayoutGeometry {
  schema_version: number;
  units: "m";
  width_m: number;
  height_m: number;
  /** Translation that was subtracted from the source coordinates. */
  offset_applied: Point;
  outline: Ring;
  walls: OpenPath[];
  columns: ColumnShape[];
  aisles: Ring[];
  zones: Zone[];
  /** EBI-ROUTE centerlines, preserved verbatim for the future routing phase. */
  routes: OpenPath[];
  ports: Port[];
}

/** Normalized asset footprint: local coordinates, origin at the outline bbox min. */
export interface FootprintGeometry {
  schema_version: number;
  units: "m";
  width_m: number;
  depth_m: number;
  outline: Ring;
  ports: Port[];
}

export type ReportSeverity = "error" | "warning" | "info";

export interface ReportLine {
  severity: ReportSeverity;
  /** Stable machine code (English), e.g. "outline-missing". */
  code: string;
  /** Human message (Spanish UI copy). */
  message: string;
}

export interface ValidationReport {
  /** True when no `error` lines exist — the draft may be confirmed. */
  ok: boolean;
  lines: ReportLine[];
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bboxOf(points: readonly Point[]): Bbox | null {
  if (points.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Millimeter precision — matches the DECIMAL(9,3) columns. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function translate(p: Point, offset: Point): Point {
  return { x: round3(p.x - offset.x), y: round3(p.y - offset.y) };
}

/** Ray-casting point-in-polygon (used to attach zone labels). */
export function pointInPolygon(p: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Normalize any angle to [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return round3(d < 0 ? d + 360 : d);
}

/** Quick-create footprint: a plain W×D rectangle, no CAD involved. */
export function rectangleFootprint(
  widthM: number,
  depthM: number,
): FootprintGeometry {
  const w = round3(widthM);
  const d = round3(depthM);
  return {
    schema_version: 1,
    units: "m",
    width_m: w,
    depth_m: d,
    outline: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ],
    ports: [],
  };
}
