import { listAssets } from "@/modules/maintenance/db";
import { listFootprints } from "@/modules/production/db/footprint";
import { listPlants } from "@/modules/org/db/org";
import {
  FootprintsPage,
  type FootprintTableRow,
} from "@/modules/production/components/footprints-page";

export const dynamic = "force-dynamic";

/** Huellas de equipo — vista superior a escala por activo. */
export default async function FootprintsRoute() {
  const [assets, footprints, plants] = await Promise.all([
    listAssets({ activeOnly: true }).catch(() => []),
    listFootprints().catch(() => []),
    listPlants().catch(() => []),
  ]);
  const plantNames = new Map(plants.map((p) => [p.plant_id, p.name]));
  const fpByAsset = new Map(footprints.map((f) => [f.asset_id, f]));

  const rows: FootprintTableRow[] = assets.map((a) => {
    const fp = fpByAsset.get(a.asset_id);
    return {
      asset_id: a.asset_id,
      code: a.code,
      name: a.name,
      plant_name: plantNames.get(a.plant_id) ?? "",
      width_m: fp ? Number(fp.width_m) : null,
      depth_m: fp ? Number(fp.depth_m) : null,
      source_kind: fp?.source_kind ?? null,
      updated_at: fp?.updated_at.toISOString() ?? null,
    };
  });

  return <FootprintsPage rows={rows} />;
}
