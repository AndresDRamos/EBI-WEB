"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Move, RotateCcw, RotateCw, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiMutate } from "@/lib/api-client";
import { useCan } from "@/components/providers/permissions-provider";
import { LayoutCanvas, type PlacedShape } from "./layout-canvas";
import { LayoutPalette, type PaletteAsset } from "./layout-palette";
import type { LayoutGeometry, Point } from "@/modules/production/dxf/geometry";

export interface EditorLayout {
  layout_id: number;
  plant_id: number;
  name: string;
  version: number;
  status: string;
  width_m: number;
  height_m: number;
  geometry: LayoutGeometry;
}

export interface FootprintShape {
  width_m: number;
  depth_m: number;
  outline: Point[];
}

export interface LayoutEditorPageProps {
  layout: EditorLayout | null;
  initialPlacements: PlacedShape[];
  paletteAssets: PaletteAsset[];
  /** Footprint local geometry per asset, for shapes placed during the session. */
  footprintsByAsset: Record<number, FootprintShape>;
}

interface PlacementApiResult {
  placement?: {
    placement_id: number;
    asset_id: number;
    x_m: number;
    y_m: number;
    rotation_deg: number;
  };
}

const SNAP_M = 0.1;

function snap(v: number): number {
  return Math.round(v / SNAP_M) * SNAP_M;
}

function snapPoint(p: Point): Point {
  return { x: Math.max(0, snap(p.x)), y: Math.max(0, snap(p.y)) };
}

/**
 * Placement editor over the layout canvas. Every mutation goes through the
 * placements API (close + insert — positions are never rewritten in place);
 * the local state mirrors the API result, so a failed call rolls back to the
 * server truth.
 */
export function LayoutEditorPage({
  layout,
  initialPlacements,
  paletteAssets,
  footprintsByAsset,
}: LayoutEditorPageProps) {
  const can = useCan();
  const router = useRouter();
  const canCreate = can("production.placement:create");
  const canClose = can("production.placement:close");
  const canMove = canCreate && canClose;

  const [placements, setPlacements] = React.useState(initialPlacements);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [armedAssetId, setArmedAssetId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Pose before the current drag, to roll back when the move API fails.
  const dragOrigin = React.useRef<PlacedShape | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setArmedAssetId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const placedAssetIds = new Set(placements.map((p) => p.asset_id));
  const palette: PaletteAsset[] = paletteAssets.map((a) => ({
    ...a,
    placed: placedAssetIds.has(a.asset_id),
  }));
  const selected = placements.find((p) => p.placement_id === selectedId) ?? null;

  async function onCanvasClick(world: Point) {
    if (!layout || armedAssetId === null || !canCreate || busy) return;
    const fp = footprintsByAsset[armedAssetId];
    const asset = paletteAssets.find((a) => a.asset_id === armedAssetId);
    if (!fp || !asset) return;
    const pos = snapPoint(world);
    setBusy(true);
    setError(null);
    try {
      const data = await apiMutate<PlacementApiResult>(
        `/api/production/layouts/${layout.layout_id}/placements`,
        {
          body: {
            asset_id: armedAssetId,
            x_m: pos.x,
            y_m: pos.y,
            rotation_deg: 0,
          },
          fallback: "Error inesperado.",
        },
      );
      if (data.placement) {
        setPlacements((prev) => [
          ...prev,
          {
            placement_id: data.placement!.placement_id,
            asset_id: armedAssetId,
            label: asset.code,
            x_m: Number(data.placement!.x_m),
            y_m: Number(data.placement!.y_m),
            rotation_deg: Number(data.placement!.rotation_deg),
            width_m: fp.width_m,
            depth_m: fp.depth_m,
            outline: fp.outline,
          },
        ]);
      }
      setArmedAssetId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  function onPlacementDrag(placementId: number, world: Point) {
    if (!canMove || busy) return;
    if (!dragOrigin.current || dragOrigin.current.placement_id !== placementId) {
      dragOrigin.current =
        placements.find((p) => p.placement_id === placementId) ?? null;
    }
    const pos = snapPoint(world);
    setPlacements((prev) =>
      prev.map((p) =>
        p.placement_id === placementId ? { ...p, x_m: pos.x, y_m: pos.y } : p,
      ),
    );
  }

  async function onPlacementDrop(placementId: number, world: Point) {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    if (!canMove || busy) return;
    const current = placements.find((p) => p.placement_id === placementId);
    if (!current) return;
    const pos = snapPoint(world);
    if (origin && origin.x_m === pos.x && origin.y_m === pos.y) return;
    await moveSelected(placementId, pos.x, pos.y, current.rotation_deg, origin);
  }

  async function moveSelected(
    placementId: number,
    x: number,
    y: number,
    rotation: number,
    rollback: PlacedShape | null,
  ) {
    setBusy(true);
    setError(null);
    try {
      const data = await apiMutate<PlacementApiResult>(
        `/api/production/placements/${placementId}/move`,
        {
          body: { x_m: x, y_m: y, rotation_deg: rotation },
          fallback: "Error inesperado.",
        },
      );
      if (data.placement) {
        // Move = close + insert: the row id changes, mirror the new truth.
        setPlacements((prev) =>
          prev.map((p) =>
            p.placement_id === placementId
              ? {
                  ...p,
                  placement_id: data.placement!.placement_id,
                  x_m: Number(data.placement!.x_m),
                  y_m: Number(data.placement!.y_m),
                  rotation_deg: Number(data.placement!.rotation_deg),
                }
              : p,
          ),
        );
        if (selectedId === placementId)
          setSelectedId(data.placement.placement_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      if (rollback) {
        setPlacements((prev) =>
          prev.map((p) =>
            p.placement_id === placementId ? { ...rollback } : p,
          ),
        );
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRotate(deltaDeg: number) {
    if (!selected || !canMove || busy) return;
    const rotation = (((selected.rotation_deg + deltaDeg) % 360) + 360) % 360;
    await moveSelected(
      selected.placement_id,
      selected.x_m,
      selected.y_m,
      rotation,
      { ...selected },
    );
  }

  async function onClosePlacement() {
    if (!selected || !canClose || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiMutate(`/api/production/placements/${selected.placement_id}/close`, {
        fallback: "Error inesperado.",
      });
      setPlacements((prev) =>
        prev.filter((p) => p.placement_id !== selected.placement_id),
      );
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  if (!layout) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">Editor de colocaciones</h1>
        <p className="text-sm text-muted-foreground">
          Esta planta no tiene un layout activo — importa y confirma un DXF
          primero.
        </p>
        <Link
          href="/test/layout"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al layout
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Move className="h-5 w-5 text-[#ff5c35]" />
          <div>
            <h1 className="text-lg font-semibold">
              Colocaciones — {layout.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              v{layout.version} · {layout.width_m} × {layout.height_m} m · snap{" "}
              {SNAP_M} m
            </p>
          </div>
          <Badge variant="secondary">{placements.length} colocados</Badge>
        </div>
        <div className="flex items-center gap-2">
          {selected ? (
            <>
              <span className="font-mono text-sm">{selected.label}</span>
              {canMove ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRotate(-90)}
                    disabled={busy}
                    title="Rotar -90°"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRotate(90)}
                    disabled={busy}
                    title="Rotar +90°"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              {canClose ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClosePlacement}
                  disabled={busy}
                >
                  <X className="mr-1 h-4 w-4" />
                  Quitar
                </Button>
              ) : null}
            </>
          ) : null}
          <Link
            href={`/test/layout?plant=${layout.plant_id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Volver
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          className={
            armedAssetId !== null
              ? "min-w-0 flex-1 cursor-crosshair rounded-lg border border-[#ff5c35] bg-white"
              : "min-w-0 flex-1 rounded-lg border border-border bg-white"
          }
        >
          <LayoutCanvas
            geometry={layout.geometry}
            placements={placements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCanvasClick={onCanvasClick}
            onPlacementDrag={canMove ? onPlacementDrag : undefined}
            onPlacementDrop={canMove ? onPlacementDrop : undefined}
            interactive={canMove}
          />
        </div>
        <aside className="w-72 shrink-0 rounded-lg border border-border p-3">
          <LayoutPalette
            assets={palette}
            armedAssetId={armedAssetId}
            onArm={canCreate ? setArmedAssetId : () => {}}
            disabled={!canCreate || busy}
          />
        </aside>
      </div>
    </div>
  );
}
