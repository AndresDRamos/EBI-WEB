import { findActiveLayout } from "@/modules/production/db/layout";
import { listByLayout } from "@/modules/production/db/placement";
import { listFootprintsByAssets } from "@/modules/production/db/footprint";
import { listAssets } from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import {
  LayoutEditorPage,
  type EditorLayout,
  type FootprintShape,
} from "@/modules/production/components/layout-editor-page";
import type { PaletteAsset } from "@/modules/production/components/layout-palette";
import type { PlacedShape } from "@/modules/production/components/layout-canvas";
import type { FootprintGeometry } from "@/modules/production/dxf/geometry";

export const dynamic = "force-dynamic";

/** Editor de colocaciones — drag & drop de equipos sobre el layout activo. */
export default async function LayoutEditRoute({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string }>;
}) {
  const { plant } = await searchParams;
  const plants = await listPlants(true).catch(() => []);
  const requested = Number(plant);
  const plantId =
    Number.isInteger(requested) && plants.some((p) => p.plant_id === requested)
      ? requested
      : (plants[0]?.plant_id ?? null);

  const layout =
    plantId !== null
      ? await findActiveLayout(plantId).catch(() => undefined)
      : undefined;

  if (!layout) {
    return (
      <LayoutEditorPage
        layout={null}
        initialPlacements={[]}
        paletteAssets={[]}
        footprintsByAsset={{}}
      />
    );
  }

  const [placements, assets] = await Promise.all([
    listByLayout(layout.layout_id, { currentOnly: true }).catch(() => []),
    listAssets({ plantId: layout.plant_id, activeOnly: true }).catch(() => []),
  ]);
  const footprints = await listFootprintsByAssets([
    ...new Set([
      ...assets.map((a) => a.asset_id),
      ...placements.map((p) => p.asset_id),
    ]),
  ]).catch(() => []);

  const footprintsByAsset: Record<number, FootprintShape> = {};
  for (const f of footprints) {
    const geometry = JSON.parse(f.geometry) as FootprintGeometry;
    footprintsByAsset[f.asset_id] = {
      width_m: Number(f.width_m),
      depth_m: Number(f.depth_m),
      outline: geometry.outline,
    };
  }

  const shapes: PlacedShape[] = placements.map((p) => {
    const fp = footprintsByAsset[p.asset_id];
    return {
      placement_id: p.placement_id,
      asset_id: p.asset_id,
      label: p.asset_code,
      x_m: Number(p.x_m),
      y_m: Number(p.y_m),
      rotation_deg: Number(p.rotation_deg),
      width_m: fp?.width_m ?? 1,
      depth_m: fp?.depth_m ?? 1,
      outline: fp?.outline ?? [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
  });

  const paletteAssets: PaletteAsset[] = assets.map((a) => ({
    asset_id: a.asset_id,
    code: a.code,
    name: a.name,
    has_footprint: a.asset_id in footprintsByAsset,
    placed: false, // recomputed client-side from live placements
  }));

  const editorLayout: EditorLayout = {
    layout_id: layout.layout_id,
    plant_id: layout.plant_id,
    name: layout.name,
    version: layout.version,
    status: layout.status,
    width_m: Number(layout.width_m),
    height_m: Number(layout.height_m),
    geometry: JSON.parse(layout.geometry),
  };

  return (
    <LayoutEditorPage
      layout={editorLayout}
      initialPlacements={shapes}
      paletteAssets={paletteAssets}
      footprintsByAsset={footprintsByAsset}
    />
  );
}
