import { NextResponse, type NextRequest } from "next/server";
import { getCellDetail, findCellById, assign } from "@/modules/production/db";
import { findAssetById, assetTypeSupportsProcess } from "@/modules/maintenance/db";
import { assignAssetSchema } from "@/modules/production/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/** GET /api/production/cells/[id]/assignments — current + closed history
 * (any authenticated user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la celda.", label: "GET /api/production/cells/[id]/assignments" },
    async () => {
      const detail = await getCellDetail(id);
      if (!detail) return notFound("Celda no encontrada.");
      return NextResponse.json({ current: detail.current, history: detail.history });
    },
  );
}

/** POST /api/production/cells/[id]/assignments — assign an asset to this cell.
 * The filtered unique index allows the same asset to hold current assignments
 * in several cells at once; only a duplicate current (asset, cell) pair 409s. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cellId = parseId((await params).id);
  if (!cellId) return badRequest("ID inválido.");
  const body = await parseBody(request, assignAssetSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("production.assignment:create"),
      uniqueFallback: "El equipo ya tiene una asignación vigente en esta celda.",
      fail: "No se pudo asignar el equipo.",
      label: "POST /api/production/cells/[id]/assignments",
    },
    async (user) => {
      const cell = await findCellById(cellId);
      if (!cell) return notFound("Celda no encontrada.");
      const asset = await findAssetById(body.asset_id);
      if (!asset) return unprocessable("Equipo inválido.");
      // Cross-schema invariant (V18, app-enforced — house style, no triggers):
      // an asset only works in a cell that shares its physical location.
      if (cell.location_id === null || cell.location_id !== asset.location_id) {
        return unprocessable("La celda no está en la misma ubicación que el equipo.");
      }
      // Cross-schema invariant (V19, app-enforced — house style, no triggers):
      // an asset only works in a cell whose declared process its type supports.
      if (
        cell.process_id !== null &&
        !(await assetTypeSupportsProcess(asset.asset_type_id, cell.process_id))
      ) {
        return unprocessable("El tipo del equipo no soporta el proceso de la celda.");
      }
      const assignment = await assign({
        asset_id: body.asset_id,
        cell_id: cellId,
        role_label: body.role_label,
        valid_from: body.valid_from,
        note: body.note,
        created_by: user.id,
      });
      return NextResponse.json({ assignment }, { status: 201 });
    },
  );
}
