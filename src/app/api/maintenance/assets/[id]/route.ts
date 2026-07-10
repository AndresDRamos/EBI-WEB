import { NextResponse, type NextRequest } from "next/server";
import {
  getAssetDetail,
  findAssetById,
  updateAsset,
  softDeleteAsset,
} from "@/modules/maintenance/db";
import { findLocationById } from "@/modules/org/db/locations";
import { listHistoryByAsset } from "@/modules/production/db";
import { updateAssetSchema } from "@/modules/maintenance/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/** GET /api/maintenance/assets/[id] — full detail incl. production cell
 * assignment history (any authenticated user) — backs the equipment modal's
 * tabs (Documentación/Restricciones) and the Celda field. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar el equipo.", label: "GET /api/maintenance/assets/[id]" },
    async () => {
      const detail = await getAssetDetail(id);
      if (!detail) return notFound("Equipo no encontrado.");
      const assignments = await listHistoryByAsset(id).catch(() => []);
      return NextResponse.json({ ...detail, assignments });
    },
  );
}

/** PATCH /api/maintenance/assets/[id] — update fields. `code`, `status` and
 * `plant_id` are not accepted: the matrícula is immutable, status is not
 * user-settable, and the plant derives from the location (V18). Moving the
 * asset to another location closes its current cell assignments (they no
 * longer share the location — historized close, never a delete). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateAssetSchema(id));
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset:update"),
      fail: "No se pudo actualizar el equipo.",
      label: "PATCH /api/maintenance/assets/[id]",
    },
    async () => {
      const existing = await findAssetById(id);
      if (!existing) return notFound("Equipo no encontrado.");
      const movingLocation =
        body.location_id !== undefined && body.location_id !== existing.location_id;
      if (movingLocation && body.location_id !== undefined) {
        const location = await findLocationById(body.location_id);
        if (!location || !location.is_active) return unprocessable("Ubicación inválida.");
      }
      // The location changed under the asset's cell assignments — moving the
      // asset closes them (physically the machine left those cells). Same
      // historized close the cell detail uses; permission-wise it rides on
      // maintenance.asset:update because it is a consequence of moving the
      // asset, not a standalone act. updateAsset() runs the update + closes
      // in one transaction when movingLocation is set.
      await updateAsset(id, body, { movingLocation });
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/maintenance/assets/[id] — soft delete (admin). Assets are history-bearing. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset:delete"),
      fail: "No se pudo desactivar el equipo.",
      label: "DELETE /api/maintenance/assets/[id]",
    },
    async () => {
      if (!(await findAssetById(id))) return notFound("Equipo no encontrado.");
      await softDeleteAsset(id);
      return NextResponse.json({ ok: true });
    },
  );
}
