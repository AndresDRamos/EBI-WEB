"use client";

import * as React from "react";
import type { LayoutGeometry, Point } from "@/modules/production/dxf/geometry";

/**
 * SVG plant-layout canvas: renders the normalized geometry JSON (ADR 0006)
 * plus asset placements, with custom wheel-zoom / drag-pan (no d3). World
 * coordinates are meters, y-up (CAD convention); a group transform flips the
 * y axis for SVG. Presentational + event callbacks only — placement state and
 * API calls live in the pages that compose it.
 */

export interface PlacedShape {
  placement_id: number;
  asset_id: number;
  label: string;
  /** Center of the footprint bbox, meters (house semantic for x_m/y_m). */
  x_m: number;
  y_m: number;
  rotation_deg: number;
  width_m: number;
  depth_m: number;
  /** Footprint outline in local coords ((0,0) = bbox min). */
  outline: Point[];
}

export interface LayoutCanvasProps {
  geometry: LayoutGeometry;
  placements?: PlacedShape[];
  selectedId?: number | null;
  onSelect?: (placementId: number | null) => void;
  /** Fires with world coords (meters) on a plain canvas click. */
  onCanvasClick?: (p: Point) => void;
  /** Live drag of a placement (world coords); parent owns position state. */
  onPlacementDrag?: (placementId: number, p: Point) => void;
  onPlacementDrop?: (placementId: number, p: Point) => void;
  /** Enables placement dragging (editor); viewer leaves it off. */
  interactive?: boolean;
  className?: string;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD_FRACTION = 0.05;
const MIN_ZOOM_SPAN_M = 2;

function ringPath(points: Point[], close: boolean): string {
  if (points.length === 0) return "";
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  return close ? `${d} Z` : d;
}

function centroid(points: Point[]): Point {
  let x = 0,
    y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(points.length, 1);
  return { x: x / n, y: y / n };
}

export function LayoutCanvas({
  geometry,
  placements = [],
  selectedId = null,
  onSelect,
  onCanvasClick,
  onPlacementDrag,
  onPlacementDrop,
  interactive = false,
  className,
}: LayoutCanvasProps) {
  const H = geometry.height_m;
  const W = geometry.width_m;
  const pad = Math.max(W, H) * PAD_FRACTION;
  const initialVb = React.useMemo<ViewBox>(
    () => ({ x: -pad, y: -pad, w: W + pad * 2, h: H + pad * 2 }),
    [W, H, pad],
  );
  const [vb, setVb] = React.useState<ViewBox>(initialVb);
  // Reset the view when the geometry (and thus the initial viewBox) changes —
  // state-during-render adjustment, not an effect (react.dev/learn/you-might-not-need-an-effect).
  const [prevInitialVb, setPrevInitialVb] = React.useState(initialVb);
  if (prevInitialVb !== initialVb) {
    setPrevInitialVb(initialVb);
    setVb(initialVb);
  }

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  // Transient gesture state — refs, not state: no re-render per pointermove.
  const gesture = React.useRef<
    | { kind: "pan"; startX: number; startY: number; startVb: ViewBox }
    | { kind: "drag"; placementId: number; moved: boolean; last: Point }
    | null
  >(null);

  /** Client pixel → SVG user coords, honoring xMidYMid meet letterboxing. */
  const toSvg = React.useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / vb.w, rect.height / vb.h);
      const ox = (rect.width - vb.w * scale) / 2;
      const oy = (rect.height - vb.h * scale) / 2;
      return {
        x: vb.x + (clientX - rect.left - ox) / scale,
        y: vb.y + (clientY - rect.top - oy) / scale,
      };
    },
    [vb],
  );

  /** SVG user coords → world meters (undo the y flip). */
  const toWorld = React.useCallback(
    (svgPt: Point): Point => ({ x: svgPt.x, y: H - svgPt.y }),
    [H],
  );

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    const at = toSvg(e.clientX, e.clientY);
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setVb((prev) => {
      const w = Math.min(
        Math.max(prev.w * factor, MIN_ZOOM_SPAN_M),
        initialVb.w * 4,
      );
      const h = (w / prev.w) * prev.h;
      return {
        x: at.x - ((at.x - prev.x) / prev.w) * w,
        y: at.y - ((at.y - prev.y) / prev.h) * h,
        w,
        h,
      };
    });
  }

  function onBackgroundPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (gesture.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      startVb: vb,
    };
  }

  function onShapePointerDown(
    e: React.PointerEvent<SVGGElement>,
    shape: PlacedShape,
  ) {
    e.stopPropagation();
    onSelect?.(shape.placement_id);
    if (!interactive) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    gesture.current = {
      kind: "drag",
      placementId: shape.placement_id,
      moved: false,
      last: { x: shape.x_m, y: shape.y_m },
    };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / vb.w, rect.height / vb.h);
      setVb({
        ...g.startVb,
        x: g.startVb.x - (e.clientX - g.startX) / scale,
        y: g.startVb.y - (e.clientY - g.startY) / scale,
      });
    } else {
      const world = toWorld(toSvg(e.clientX, e.clientY));
      g.moved = true;
      g.last = world;
      onPlacementDrag?.(g.placementId, world);
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "pan") {
      // A pan that never moved is a plain click on the canvas background.
      const dx = Math.abs(e.clientX - g.startX);
      const dy = Math.abs(e.clientY - g.startY);
      if (dx < 3 && dy < 3) {
        onSelect?.(null);
        onCanvasClick?.(toWorld(toSvg(e.clientX, e.clientY)));
      }
    } else if (g.moved) {
      onPlacementDrop?.(g.placementId, g.last);
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? "h-full w-full touch-none select-none"}
      onWheel={onWheel}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="img"
      aria-label="Layout de planta"
    >
      {/* y-up world → y-down SVG */}
      <g transform={`translate(0 ${H}) scale(1 -1)`}>
        {/* zones under everything */}
        {geometry.zones.map((z, i) => (
          <g key={`zone-${i}`}>
            <path
              d={ringPath(z.polygon, true)}
              fill="#ff5c35"
              fillOpacity={0.06}
              stroke="#ff5c35"
              strokeOpacity={0.35}
              strokeWidth={0.08}
              strokeDasharray="0.5 0.3"
            />
            {z.label ? (
              <text
                transform={`translate(${centroid(z.polygon).x} ${centroid(z.polygon).y}) scale(1 -1)`}
                textAnchor="middle"
                fontSize={1.6}
                fill="#ff5c35"
                fillOpacity={0.7}
                className="font-semibold uppercase"
              >
                {z.label}
              </text>
            ) : null}
          </g>
        ))}
        {geometry.aisles.map((a, i) => (
          <path
            key={`aisle-${i}`}
            d={ringPath(a, true)}
            fill="#373a36"
            fillOpacity={0.05}
            stroke="#373a36"
            strokeOpacity={0.25}
            strokeWidth={0.06}
          />
        ))}
        <path
          d={ringPath(geometry.outline, true)}
          fill="none"
          stroke="#373a36"
          strokeWidth={0.25}
        />
        {geometry.walls.map((w, i) => (
          <path
            key={`wall-${i}`}
            d={ringPath(w.vertices, w.closed)}
            fill="none"
            stroke="#373a36"
            strokeOpacity={0.6}
            strokeWidth={0.12}
          />
        ))}
        {geometry.columns.map((c, i) =>
          c.kind === "circle" ? (
            <circle
              key={`col-${i}`}
              cx={c.center.x}
              cy={c.center.y}
              r={c.radius_m}
              fill="#373a36"
              fillOpacity={0.5}
            />
          ) : (
            <path
              key={`col-${i}`}
              d={ringPath(c.vertices, true)}
              fill="#373a36"
              fillOpacity={0.5}
            />
          ),
        )}
        {geometry.routes.map((r, i) => (
          <path
            key={`route-${i}`}
            d={ringPath(r.vertices, r.closed)}
            fill="none"
            stroke="#2563eb"
            strokeOpacity={0.5}
            strokeWidth={0.1}
            strokeDasharray="0.6 0.4"
          />
        ))}
        {geometry.ports.map((p, i) => (
          <g
            key={`port-${i}`}
            transform={`translate(${p.x} ${p.y}) rotate(${p.direction_deg})`}
          >
            <path
              d="M -0.9 -0.6 L 0.9 0 L -0.9 0.6 Z"
              fill={p.kind === "in" ? "#16a34a" : "#ff5c35"}
              fillOpacity={0.9}
            />
          </g>
        ))}
        {placements.map((s) => {
          const selected = s.placement_id === selectedId;
          return (
            <g
              key={s.placement_id}
              transform={`translate(${s.x_m} ${s.y_m}) rotate(${s.rotation_deg}) translate(${-s.width_m / 2} ${-s.depth_m / 2})`}
              onPointerDown={(e) => onShapePointerDown(e, s)}
              className={interactive ? "cursor-move" : "cursor-pointer"}
            >
              <path
                d={ringPath(s.outline, true)}
                fill={selected ? "#ff5c35" : "#373a36"}
                fillOpacity={selected ? 0.35 : 0.2}
                stroke={selected ? "#ff5c35" : "#373a36"}
                strokeWidth={selected ? 0.12 : 0.08}
              />
              <text
                transform={`translate(${s.width_m / 2} ${s.depth_m / 2}) rotate(${-s.rotation_deg}) scale(1 -1)`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(1.2, Math.max(0.5, s.width_m / 5))}
                fill="#373a36"
                className="pointer-events-none font-mono font-semibold"
              >
                {s.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
