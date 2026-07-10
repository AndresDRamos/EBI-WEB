import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetCategoryById,
  updateAssetCategory,
  deleteAssetCategory,
} from "@/modules/maintenance/db";
import { updateAssetCategorySchema } from "@/modules/maintenance/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** PUT /api/maintenance/asset-categories/[id] — update / soft-delete / restore. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateAssetCategorySchema);
  if (body instanceof NextResponse) return body;

  const changes: Parameters<typeof updateAssetCategory>[1] = {};
  if (body.code !== undefined) changes.code = body.code;
  if (body.name !== undefined) changes.name = body.name;
  if (body.is_active !== undefined) changes.is_active = body.is_active;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset_category:update"),
      uniqueFallback: "El código o el prefijo ya existen.",
      fail: "No se pudo actualizar la categoría.",
      label: "PUT /api/maintenance/asset-categories/[id]",
    },
    async () => {
      if (!(await findAssetCategoryById(id))) {
        return notFound("Categoría no encontrada.");
      }
      await updateAssetCategory(id, changes);
      return NextResponse.json({ ok: true });
    },
  );
}

/**
 * DELETE /api/maintenance/asset-categories/[id] — hard delete. 409s when a
 * type (or, transitively, an asset) still references the category — soft
 * delete (PUT is_active:false) is the recoverable path.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset_category:delete"),
      uniqueRules: [
        {
          pattern: /REFERENCE|FOREIGN KEY|conflicted/i,
          message: "La categoría tiene tipos o secuencias asociados; desactívala en su lugar.",
        },
      ],
      fail: "No se pudo eliminar la categoría.",
      label: "DELETE /api/maintenance/asset-categories/[id]",
    },
    async () => {
      if (!(await findAssetCategoryById(id))) {
        return notFound("Categoría no encontrada.");
      }
      await deleteAssetCategory(id);
      return NextResponse.json({ ok: true });
    },
  );
}
