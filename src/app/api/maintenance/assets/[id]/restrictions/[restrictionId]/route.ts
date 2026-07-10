import { NextResponse, type NextRequest } from "next/server";
import {
  findRestrictionById,
  updateRestriction,
  softDeleteRestriction,
} from "@/modules/maintenance/db";
import { updateRestrictionSchema } from "@/modules/maintenance/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** PUT /api/maintenance/assets/[id]/restrictions/[restrictionId] — update (admin). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; restrictionId: string }> },
) {
  const resolved = await params;
  const assetId = parseId(resolved.id);
  const restrictionId = parseId(resolved.restrictionId);
  if (!assetId || !restrictionId) {
    return badRequest("ID inválido.");
  }
  const body = await parseBody(request, updateRestrictionSchema);
  if (body instanceof NextResponse) return body;

  const changes: {
    restriction_type?: string;
    description?: string;
    is_active?: boolean;
  } = {};
  if (body.restriction_type !== undefined) changes.restriction_type = body.restriction_type;
  if (body.description !== undefined) changes.description = body.description;
  if (body.is_active !== undefined) changes.is_active = body.is_active;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.restriction:update"),
      fail: "No se pudo actualizar la restricción.",
      label: "PUT /api/maintenance/assets/[id]/restrictions/[restrictionId]",
    },
    async () => {
      const current = await findRestrictionById(restrictionId);
      if (!current || current.asset_id !== assetId) {
        return notFound("Restricción no encontrada.");
      }
      await updateRestriction(restrictionId, changes);
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/maintenance/assets/[id]/restrictions/[restrictionId] — soft delete (admin). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; restrictionId: string }> },
) {
  const resolved = await params;
  const assetId = parseId(resolved.id);
  const restrictionId = parseId(resolved.restrictionId);
  if (!assetId || !restrictionId) {
    return badRequest("ID inválido.");
  }
  return handleRoute(
    {
      guard: () => requirePermission("maintenance.restriction:delete"),
      fail: "No se pudo eliminar la restricción.",
      label: "DELETE /api/maintenance/assets/[id]/restrictions/[restrictionId]",
    },
    async () => {
      const current = await findRestrictionById(restrictionId);
      if (!current || current.asset_id !== assetId) {
        return notFound("Restricción no encontrada.");
      }
      await softDeleteRestriction(restrictionId);
      return NextResponse.json({ ok: true });
    },
  );
}
