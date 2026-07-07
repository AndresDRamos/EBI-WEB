import { findActiveLayout, listLayouts } from "@/modules/production/db/layout";
import { listByLayout } from "@/modules/production/db/placement";
import { listFootprintsByAssets } from "@/modules/production/db/footprint";
import { listPlants } from "@/modules/org/db/org";
import {
  LayoutViewerPage,
  type ActiveLayoutView,
  type VersionRow,
} from "@/modules/production/components/layout-viewer-page";
import type { PlacedShape } from "@/modules/production/components/layout-canvas";
import type { FootprintGeometry } from "@/modules/production/dxf/geometry";

export const dynamic = "force-dynamic";

/** Layout — active plant-layout viewer (empty state when none is active). */
export default async function LayoutViewerRoute({
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
    plantId !== null ? await findActiveLayout(plantId).catch(() => undefined) : undefined;
  const versions = plantId !== null ? await listLayouts(plantId).catch(() => []) : [];
  const placements = layout
    ? await listByLayout(layout.layout_id, { currentOnly: true }).catch(() => [])
    : [];
  const footprints = await listFootprintsByAssets([
    ...new Set(placements.map((p) => p.asset_id)),
  ]).catch(() => []);
  const fpByAsset = new Map(footprints.map((f) => [f.asset_id, f]));

  const shapes: PlacedShape[] = placements.map((p) => {
    const fp = fpByAsset.get(p.asset_id);
    const geometry = fp
      ? (JSON.parse(fp.geometry) as FootprintGeometry)
      : null;
    return {
      placement_id: p.placement_id,
      asset_id: p.asset_id,
      label: p.asset_code,
      x_m: Number(p.x_m),
      y_m: Number(p.y_m),
      rotation_deg: Number(p.rotation_deg),
      // Assets placed before losing their footprint fall back to a 1×1 mark.
      width_m: fp ? Number(fp.width_m) : 1,
      depth_m: fp ? Number(fp.depth_m) : 1,
      outline: geometry?.outline ?? [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
  });

  const layoutView: ActiveLayoutView | null = layout
    ? {
        layout_id: layout.layout_id,
        name: layout.name,
        version: layout.version,
        width_m: Number(layout.width_m),
        height_m: Number(layout.height_m),
        activated_at: layout.activated_at?.toISOString() ?? null,
        geometry: JSON.parse(layout.geometry),
      }
    : null;

  const versionRows: VersionRow[] = versions.map((v) => ({
    layout_id: v.layout_id,
    version: v.version,
    name: v.name,
    status: v.status,
    created_at: v.created_at.toISOString(),
  }));

  return (
    <LayoutViewerPage
      plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
      plantId={plantId}
      layout={layoutView}
      placements={shapes}
      versions={versionRows}
    />
  );
}
