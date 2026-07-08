import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetTypeById,
  updateAssetType,
  deleteAssetType,
} from "@/modules/maintenance/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface PutBody {
  asset_category_id?: unknown;
  code?: unknown;
  name?: unknown;
  is_active?: unknown;
}

/** PUT /api/maintenance/asset-types/[id] — update / soft-delete / restore. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: PutBody;
  try {
    body = (await parseJsonBody(request)) as PutBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const changes: Parameters<typeof updateAssetType>[1] = {};
  if (body.asset_category_id !== undefined) {
    const categoryId = Number(body.asset_category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "Categoría inválida." }, { status: 422 });
    }
    changes.asset_category_id = categoryId;
  }
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requirePermission("maintenance.asset_type:update");
    if (!(await findAssetTypeById(id))) {
      return NextResponse.json({ error: "Tipo no encontrado." }, { status: 404 });
    }
    await updateAssetType(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: "Ya existe un tipo con ese código en la categoría." },
        { status: 409 },
      );
    }
    console.error("PUT /api/maintenance/asset-types/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el tipo." },
      { status: 500 },
    );
  }
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
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requirePermission("maintenance.asset_type:delete");
    if (!(await findAssetTypeById(id))) {
      return NextResponse.json({ error: "Tipo no encontrado." }, { status: 404 });
    }
    await deleteAssetType(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/REFERENCE|FOREIGN KEY|conflicted/i.test(msg)) {
      return NextResponse.json(
        { error: "Hay equipos con este tipo; desactívalo en su lugar." },
        { status: 409 },
      );
    }
    console.error("DELETE /api/maintenance/asset-types/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar el tipo." },
      { status: 500 },
    );
  }
}
