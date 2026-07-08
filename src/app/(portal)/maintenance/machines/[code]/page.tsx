import { notFound } from "next/navigation";
import {
  findAssetByCode,
  getAssetDetail,
  listAssets,
  listAssetCategories,
  listAssetTypes,
  listProcesses,
} from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import { listHistoryByAsset } from "@/modules/production/db";
import {
  MachineDetail,
  type MachineDetailAsset,
} from "@/modules/maintenance/components/machine-detail";
import type { TypeOption } from "@/modules/maintenance/components/machine-form-dialog";

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

  const [detail, allProcesses, plants, categories, types, allAssets, assignments] =
    await Promise.all([
      getAssetDetail(asset.asset_id),
      listProcesses(true).catch(() => []),
      listPlants(true).catch(() => []),
      listAssetCategories(true).catch(() => []),
      listAssetTypes(true).catch(() => []),
      listAssets({ activeOnly: true }).catch(() => []),
      listHistoryByAsset(asset.asset_id).catch(() => []),
    ]);
  if (!detail) notFound();

  const categoryName = new Map(
    categories.map((c) => [c.asset_category_id, c.name]),
  );
  const typeOptions: TypeOption[] = types
    .filter((t) => categoryName.has(t.asset_category_id))
    .map((t) => ({
      asset_type_id: t.asset_type_id,
      name: t.name,
      asset_category_id: t.asset_category_id,
      category_name: categoryName.get(t.asset_category_id) ?? "",
    }));

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
    status: a.status,
    asset_type_id: a.asset_type_id,
    type_name: a.type_name,
    category_name: a.category_name,
    parent_asset_id: a.parent_asset_id,
    parent_code: a.parent_code,
    installation_date: a.installation_date
      ? a.installation_date.toISOString()
      : null,
    image_blob_path: a.image_blob_path,
    notes: a.notes,
    process_ids: detail.processes.map((p) => p.process_id),
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
      assignments={assignments.map((x) => ({
        assignment_id: x.assignment_id,
        cell_id: x.cell_id,
        cell_code: x.cell_code,
        cell_name: x.cell_name,
        role_label: x.role_label,
        valid_from: x.valid_from.toISOString(),
        valid_to: x.valid_to ? x.valid_to.toISOString() : null,
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
      types={typeOptions}
      parents={allAssets
        .filter((m) => m.asset_id !== asset.asset_id)
        .map((m) => ({
          asset_id: m.asset_id,
          code: m.code,
          name: m.name,
          brand: m.brand,
          model: m.model,
          serial_number: m.serial_number,
          plant_name: m.plant_name,
          type_name: m.type_name,
          has_image: m.image_blob_path !== null,
        }))}
    />
  );
}
