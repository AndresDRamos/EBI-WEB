import { notFound } from "next/navigation";
import { findAssetByCode } from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import { buildAssetQrDataUrl } from "@/modules/maintenance/qr";
import { MachineLabel } from "@/modules/maintenance/components/machine-label";

export const dynamic = "force-dynamic";

/** Printable QR label for an asset. */
export default async function MachineLabelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = decodeURIComponent((await params).code);
  const asset = await findAssetByCode(code);
  if (!asset) notFound();

  const qrDataUrl = await buildAssetQrDataUrl(asset.code);
  const plants = await listPlants().catch(() => []);
  const plantName =
    plants.find((p) => p.plant_id === asset.plant_id)?.name ?? "";

  return (
    <MachineLabel
      code={asset.code}
      name={asset.name}
      plantName={plantName}
      qrDataUrl={qrDataUrl}
    />
  );
}
