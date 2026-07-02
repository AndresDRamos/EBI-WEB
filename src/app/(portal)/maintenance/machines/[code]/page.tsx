import { notFound } from "next/navigation";
import {
  findAssetByCode,
  getAssetDetail,
  listAssets,
  listProcesses,
} from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import { isAdmin } from "@/lib/auth/rbac";
import {
  MachineDetail,
  type MachineDetailAsset,
} from "@/modules/maintenance/components/machine-detail";

export const dynamic = "force-dynamic";

/** Equipo detail — Datos / Procesos / Restricciones / Documentos. QR target. */
export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = decodeURIComponent((await params).code);
  const asset = await findAssetByCode(code);
  if (!asset) notFound();

  const [detail, allProcesses, plants, allAssets, canManage] =
    await Promise.all([
      getAssetDetail(asset.asset_id),
      listProcesses(true).catch(() => []),
      listPlants(true).catch(() => []),
      listAssets({ activeOnly: true }).catch(() => []),
      isAdmin(),
    ]);
  if (!detail) notFound();

  const a = detail.asset;
  const serialized: MachineDetailAsset = {
    asset_id: a.asset_id,
    code: a.code,
    name: a.name,
    brand: a.brand,
    model: a.model,
    serial_number: a.serial_number,
    plant_id: a.plant_id,
    plant_name: a.plant_name,
    location: a.location,
    criticality: a.criticality,
    status: a.status,
    parent_asset_id: a.parent_asset_id,
    parent_code: a.parent_code,
    acquisition_date: a.acquisition_date
      ? a.acquisition_date.toISOString()
      : null,
    notes: a.notes,
    is_active: a.is_active,
    created_at: a.created_at.toISOString(),
    updated_at: a.updated_at.toISOString(),
  };

  return (
    <MachineDetail
      asset={serialized}
      assetProcessIds={detail.processes.map((p) => p.process_id)}
      restrictions={detail.restrictions.map((r) => ({
        restriction_id: r.restriction_id,
        restriction_type: r.restriction_type,
        description: r.description,
        is_active: r.is_active,
      }))}
      documents={detail.documents.map((d) => ({
        document_id: d.document_id,
        doc_type: d.doc_type,
        title: d.title,
        content_type: d.content_type,
        file_size_bytes: d.file_size_bytes,
        version: d.version,
        is_active: d.is_active,
        uploaded_at: d.uploaded_at.toISOString(),
      }))}
      allProcesses={allProcesses.map((p) => ({
        process_id: p.process_id,
        code: p.code,
        name: p.name,
      }))}
      plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
      parents={allAssets.map((m) => ({
        asset_id: m.asset_id,
        code: m.code,
        name: m.name,
      }))}
      canManage={canManage}
    />
  );
}
