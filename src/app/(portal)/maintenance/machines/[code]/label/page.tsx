import { notFound } from "next/navigation";
import { findAssetByCode, getAssetDetail } from "@/modules/maintenance/db";
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
  // Plant derives from the asset's location since V18.
  const detail = await getAssetDetail(asset.asset_id);

  return (
    <MachineLabel
      code={asset.code}
      name={asset.name}
      plantName={detail?.asset.plant_name ?? ""}
      qrDataUrl={qrDataUrl}
    />
  );
}
