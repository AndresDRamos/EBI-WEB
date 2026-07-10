import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetTypeById,
  updateAssetType,
  deleteAssetType,
  setAssetTypeProcesses,
} from "@/modules/maintenance/db";
import { updateAssetTypeSchema } from "@/modules/maintenance/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** PUT /api/maintenance/asset-types/[id] — update / soft-delete / restore. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateAssetTypeSchema);
  if (body instanceof NextResponse) return body;

  const changes: Parameters<typeof updateAssetType>[1] = {};
  if (body.asset_category_id !== undefined) changes.asset_category_id = body.asset_category_id;
  if (body.code !== undefined) {
    // The matrícula prefix (V18) is not a separate input: it always mirrors `code`.
    changes.code = body.code;
    changes.code_prefix = body.code;
  }
  if (body.name !== undefined) changes.name = body.name;
  if (body.is_active !== undefined) changes.is_active = body.is_active;
  const processIds = body.process_ids;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset_type:update"),
      uniqueRules: [
        {
          pattern: /UQ_asset_type_prefix/i,
          message: "Ese prefijo de matrícula ya lo usa otro tipo.",
        },
      ],
      uniqueFallback: "Ya existe un tipo con ese código en la categoría.",
      fail: "No se pudo actualizar el tipo.",
      label: "PUT /api/maintenance/asset-types/[id]",
    },
    async () => {
      if (!(await findAssetTypeById(id))) {
        return notFound("Tipo no encontrado.");
      }
      if (Object.keys(changes).length > 0) await updateAssetType(id, changes);
      if (processIds !== undefined) await setAssetTypeProcesses(id, processIds);
      return NextResponse.json({ ok: true });
    },
  );
}

/**
 * DELETE /api/maintenance/asset-types/[id] — hard delete. 409s when an asset
 * still references the type; soft delete (PUT is_active:false) is the
 * recoverable path.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset_type:delete"),
      uniqueRules: [
        {
          pattern: /REFERENCE|FOREIGN KEY|conflicted/i,
          message: "Hay equipos con este tipo; desactívalo en su lugar.",
        },
      ],
      fail: "No se pudo eliminar el tipo.",
      label: "DELETE /api/maintenance/asset-types/[id]",
    },
    async () => {
      if (!(await findAssetTypeById(id))) {
        return notFound("Tipo no encontrado.");
      }
      await deleteAssetType(id);
      return NextResponse.json({ ok: true });
    },
  );
}
