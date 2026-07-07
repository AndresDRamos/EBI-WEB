/**
 * Raw extraction → normalized portal geometry. Translates the outline
 * bounding-box minimum to (0,0) (contract: origin never matters to the CAD
 * author), rounds to millimeters, attaches zone labels by point-in-polygon
 * and assigns fallback port labels. Pure module — no I/O.
 */
import { GEOMETRY_SCHEMA_VERSION } from "./contract";
import type { DxfExtraction, RawPolyline } from "./parse";
import {
  bboxOf,
  normalizeDeg,
  pointInPolygon,
  round3,
  translate,
  type FootprintGeometry,
  type LayoutGeometry,
  type Point,
  type Port,
  type Ring,
} from "./geometry";

export interface NormalizedLayout {
  geometry: LayoutGeometry;
  /** Translation subtracted from every source coordinate (reported to the user). */
  offset: Point;
}

/** The single closed outline the geometry is built around, or null. */
export function pickOutline(ex: DxfExtraction): RawPolyline | null {
  const closed = ex.outline.filter((p) => p.closed && p.vertices.length >= 3);
  return closed.length === 1 ? closed[0] : null;
}

export function normalizeLayout(ex: DxfExtraction): NormalizedLayout | null {
  const outline = pickOutline(ex);
  if (!outline) return null;
  const box = bboxOf(outline.vertices);
  if (!box) return null;

  const offset: Point = { x: box.minX, y: box.minY };
  const move = (p: Point) => translate(p, offset);
  const ring = (p: RawPolyline): Ring => p.vertices.map(move);

  const zonePolys = ex.zonePolys.filter(
    (z) => z.closed && z.vertices.length >= 3,
  );
  const zones = zonePolys.map((z) => {
    // Label = first EBI-ZONE text that falls inside the polygon (source coords).
    const label =
      ex.zoneTexts.find((t) => pointInPolygon(t.point, z.vertices))?.text ??
      null;
    return { label, polygon: ring(z) };
  });

  const counters = { in: 0, out: 0 };
  const ports: Port[] = ex.ports.map((p) => {
    counters[p.kind] += 1;
    return {
      kind: p.kind,
      ...move(p.point),
      direction_deg: normalizeDeg(p.rotation),
      // ATTRIB labels are not relied on (contract); draw-order fallback.
      label: `${p.kind.toUpperCase()}-${counters[p.kind]}`,
    };
  });

  const geometry: LayoutGeometry = {
    schema_version: GEOMETRY_SCHEMA_VERSION,
    units: "m",
    width_m: round3(box.maxX - box.minX),
    height_m: round3(box.maxY - box.minY),
    offset_applied: { x: round3(offset.x), y: round3(offset.y) },
    outline: ring(outline),
    walls: ex.walls.map((w) => ({ vertices: w.vertices.map(move), closed: w.closed })),
    columns: [
      ...ex.columnPolys
        .filter((c) => c.closed && c.vertices.length >= 3)
        .map((c) => ({ kind: "polygon" as const, vertices: ring(c) })),
      ...ex.columnCircles.map((c) => ({
        kind: "circle" as const,
        center: move(c.center),
        radius_m: round3(c.radius),
      })),
    ],
    aisles: ex.aisles
      .filter((a) => a.closed && a.vertices.length >= 3)
      .map(ring),
    zones,
    routes: ex.routes.map((r) => ({
      vertices: r.vertices.map(move),
      closed: r.closed,
    })),
    ports,
  };
  return { geometry, offset: geometry.offset_applied };
}

export function normalizeFootprint(ex: DxfExtraction): FootprintGeometry | null {
  const outline = pickOutline(ex);
  if (!outline) return null;
  const box = bboxOf(outline.vertices);
  if (!box) return null;

  const offset: Point = { x: box.minX, y: box.minY };
  const move = (p: Point) => translate(p, offset);
  const counters = { in: 0, out: 0 };

  return {
    schema_version: GEOMETRY_SCHEMA_VERSION,
    units: "m",
    width_m: round3(box.maxX - box.minX),
    depth_m: round3(box.maxY - box.minY),
    outline: outline.vertices.map(move),
    ports: ex.ports.map((p) => {
      counters[p.kind] += 1;
      return {
        kind: p.kind,
        ...move(p.point),
        direction_deg: normalizeDeg(p.rotation),
        label: `${p.kind.toUpperCase()}-${counters[p.kind]}`,
      };
    }),
  };
}
