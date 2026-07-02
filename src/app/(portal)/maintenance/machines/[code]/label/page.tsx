import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { findAssetByCode } from "@/lib/db/maint";
import { listPlants } from "@/lib/db/org";
import { MachineLabel } from "@/components/maintenance/machine-label";

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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? (await requestOrigin());
  const target = `${baseUrl}/maintenance/machines/${encodeURIComponent(asset.code)}`;
  const qrDataUrl = await QRCode.toDataURL(target, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 440,
    color: { dark: "#373a36", light: "#ffffff" },
  });

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

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  return `${proto}://${host}`;
}
