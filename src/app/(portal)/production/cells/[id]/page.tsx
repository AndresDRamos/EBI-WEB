import { notFound } from "next/navigation";
import { getCellDetail, listCells } from "@/modules/production/db";
import { listAssets } from "@/modules/maintenance/db";
import { CellDetail } from "@/modules/production/components/cell-detail";

export const dynamic = "force-dynamic";

/** Celda detail — composición vigente (asignar / reasignar / cerrar) +
 * historial cerrado, siempre preservado. */
export default async function CellDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getCellDetail(id);
  if (!detail) notFound();

  const [assets, allCells] = await Promise.all([
    listAssets({ activeOnly: true }).catch(() => []),
    listCells(true).catch(() => []),
  ]);

  const serialize = (a: (typeof detail.current)[number]) => ({
    assignment_id: a.assignment_id,
    asset_id: a.asset_id,
    asset_code: a.asset_code,
    asset_name: a.asset_name,
    role_label: a.role_label,
    valid_from: a.valid_from.toISOString(),
    valid_to: a.valid_to ? a.valid_to.toISOString() : null,
    note: a.note,
  });

  return (
    <CellDetail
      cell={{
        cell_id: detail.cell.cell_id,
        code: detail.cell.code,
        name: detail.cell.name,
        plant_name: detail.cell.plant_name,
        line_code: detail.cell.line_code,
        line_name: detail.cell.line_name,
        sequence_in_line: detail.cell.sequence_in_line,
        is_active: detail.cell.is_active,
      }}
      current={detail.current.map(serialize)}
      history={detail.history.map(serialize)}
      assets={assets.map((a) => ({
        asset_id: a.asset_id,
        code: a.code,
        name: a.name,
      }))}
      otherCells={allCells
        .filter((c) => c.cell_id !== id)
        .map((c) => ({ cell_id: c.cell_id, code: c.code, name: c.name }))}
    />
  );
}
