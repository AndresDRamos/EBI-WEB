/**
 * DXF text → raw extraction of contract entities (dxf-parser). Extraction is
 * deliberately lossless-but-selective: it keeps everything the contract names
 * (plus counts of near-misses for the validator) and drops the rest of the
 * architect's file. Pure module — no I/O.
 */
import DxfParser, {
  type IDxf,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPolylineEntity,
  type ICircleEntity,
  type ITextEntity,
  type IMtextEntity,
  type IInsertEntity,
} from "dxf-parser";
import { EBI_LAYERS, PORT_BLOCKS } from "./contract";
import type { Point, PortKind } from "./geometry";

export class DxfParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DxfParseError";
  }
}

export interface RawPolyline {
  layer: string;
  vertices: Point[];
  closed: boolean;
}

export interface RawCircle {
  layer: string;
  center: Point;
  radius: number;
}

export interface RawText {
  layer: string;
  text: string;
  point: Point;
}

export interface RawPortInsert {
  kind: PortKind;
  point: Point;
  rotation: number;
}

export interface DxfExtraction {
  /** `$INSUNITS` as declared (reported, never trusted). */
  insunits: number | null;
  /** Union of layer-table names and entity layers, uppercased. */
  layersInFile: string[];
  outline: RawPolyline[];
  walls: RawPolyline[];
  columnPolys: RawPolyline[];
  columnCircles: RawCircle[];
  aisles: RawPolyline[];
  zonePolys: RawPolyline[];
  zoneTexts: RawText[];
  routes: RawPolyline[];
  /** `EBI_PORT_IN`/`EBI_PORT_OUT` INSERTs, any layer (block name is the contract). */
  ports: RawPortInsert[];
  /** Loose LINEs found on layers that require closed polylines (validator fodder). */
  strayLinesOnClosedLayers: Record<string, number>;
}

const CLOSED_LAYERS: string[] = [
  EBI_LAYERS.OUTLINE,
  EBI_LAYERS.AISLE,
  EBI_LAYERS.ZONE,
];

function toPoint(p: { x: number; y: number }): Point {
  return { x: p.x, y: p.y };
}

function asPolyline(
  e: ILwpolylineEntity | IPolylineEntity,
  layer: string,
): RawPolyline {
  return {
    layer,
    vertices: (e.vertices ?? []).map(toPoint),
    closed: e.shape === true,
  };
}

function lineAsPolyline(e: ILineEntity, layer: string): RawPolyline {
  return { layer, vertices: (e.vertices ?? []).map(toPoint), closed: false };
}

export function parseDxf(text: string): DxfExtraction {
  const parser = new DxfParser();
  let dxf: IDxf | null;
  try {
    dxf = parser.parseSync(text);
  } catch (err) {
    throw new DxfParseError(
      err instanceof Error ? err.message : "unreadable DXF stream",
      { cause: err },
    );
  }
  if (!dxf) throw new DxfParseError("parser returned no document");

  const layers = new Set<string>(
    Object.keys(dxf.tables?.layer?.layers ?? {}).map((n) => n.toUpperCase()),
  );

  const ex: DxfExtraction = {
    insunits:
      typeof dxf.header?.$INSUNITS === "number" ? dxf.header.$INSUNITS : null,
    layersInFile: [],
    outline: [],
    walls: [],
    columnPolys: [],
    columnCircles: [],
    aisles: [],
    zonePolys: [],
    zoneTexts: [],
    routes: [],
    ports: [],
    strayLinesOnClosedLayers: {},
  };

  for (const entity of dxf.entities ?? []) {
    const e = entity as IEntity;
    if (e.inPaperSpace) continue;
    const layer = (e.layer ?? "0").toUpperCase();
    layers.add(layer);

    if (e.type === "INSERT") {
      const ins = e as IInsertEntity;
      const name = (ins.name ?? "").toUpperCase();
      const kind: PortKind | null =
        name === PORT_BLOCKS.in ? "in" : name === PORT_BLOCKS.out ? "out" : null;
      if (kind && ins.position) {
        ex.ports.push({
          kind,
          point: toPoint(ins.position),
          rotation: ins.rotation ?? 0,
        });
      }
      continue;
    }

    const isPoly = e.type === "LWPOLYLINE" || e.type === "POLYLINE";
    switch (layer) {
      case EBI_LAYERS.OUTLINE:
        if (isPoly)
          ex.outline.push(asPolyline(e as ILwpolylineEntity, layer));
        else if (e.type === "LINE") countStray(ex, layer);
        break;
      case EBI_LAYERS.WALL:
        if (isPoly) ex.walls.push(asPolyline(e as ILwpolylineEntity, layer));
        else if (e.type === "LINE")
          ex.walls.push(lineAsPolyline(e as ILineEntity, layer));
        break;
      case EBI_LAYERS.COLUMN:
        if (isPoly)
          ex.columnPolys.push(asPolyline(e as ILwpolylineEntity, layer));
        else if (e.type === "CIRCLE") {
          const c = e as ICircleEntity;
          ex.columnCircles.push({
            layer,
            center: toPoint(c.center),
            radius: c.radius,
          });
        }
        break;
      case EBI_LAYERS.AISLE:
        if (isPoly) ex.aisles.push(asPolyline(e as ILwpolylineEntity, layer));
        else if (e.type === "LINE") countStray(ex, layer);
        break;
      case EBI_LAYERS.ZONE:
        if (isPoly)
          ex.zonePolys.push(asPolyline(e as ILwpolylineEntity, layer));
        else if (e.type === "LINE") countStray(ex, layer);
        else if (e.type === "TEXT") {
          const t = e as ITextEntity;
          if (t.text && t.startPoint)
            ex.zoneTexts.push({
              layer,
              text: t.text.trim(),
              point: toPoint(t.startPoint),
            });
        } else if (e.type === "MTEXT") {
          const t = e as IMtextEntity;
          if (t.text && t.position)
            ex.zoneTexts.push({
              layer,
              // MTEXT embeds formatting codes; strip the common ones.
              text: t.text.replace(/\\[A-Za-z][^;]*;|[{}]/g, "").trim(),
              point: toPoint(t.position),
            });
        }
        break;
      case EBI_LAYERS.ROUTE:
        if (isPoly) ex.routes.push(asPolyline(e as ILwpolylineEntity, layer));
        else if (e.type === "LINE")
          ex.routes.push(lineAsPolyline(e as ILineEntity, layer));
        break;
      default:
        break;
    }
  }

  ex.layersInFile = [...layers].sort();
  return ex;
}

function countStray(ex: DxfExtraction, layer: string): void {
  if (!CLOSED_LAYERS.includes(layer)) return;
  ex.strayLinesOnClosedLayers[layer] =
    (ex.strayLinesOnClosedLayers[layer] ?? 0) + 1;
}
