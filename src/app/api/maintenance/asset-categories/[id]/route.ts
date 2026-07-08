import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetCategoryById,
  updateAssetCategory,
  deleteAssetCategory,
} from "@/modules/maintenance/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface PutBody {
  code?: unknown;
  name?: unknown;
  code_prefix?: unknown;
  is_active?: unknown;
}

/** PUT /api/maintenance/asset-categories/[id] — update / soft-delete / restore. */
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
  const changes: Parameters<typeof updateAssetCategory>[1] = {};
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.code_prefix !== undefined) {
    if (
      typeof body.code_prefix !== "string" ||
      !/^[A-Za-z0-9]{2,8}$/.test(body.code_prefix.trim())
    ) {
      return NextResponse.json(
        { error: "El prefijo debe ser alfanumérico (2–8 caracteres)." },
        { status: 422 },
      );
    }
    changes.code_prefix = body.code_prefix.trim();
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requirePermission("maintenance.asset_category:update");
    if (!(await findAssetCategoryById(id))) {
      return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
    }
    await updateAssetCategory(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: "El código o el prefijo ya existen." },
        { status: 409 },
      );
    }
    console.error("PUT /api/maintenance/asset-categories/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la categoría." },
      { status: 500 },
    );
  }
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
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requirePermission("maintenance.asset_category:delete");
    if (!(await findAssetCategoryById(id))) {
      return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
    }
    await deleteAssetCategory(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/REFERENCE|FOREIGN KEY|conflicted/i.test(msg)) {
      return NextResponse.json(
        { error: "La categoría tiene tipos o secuencias asociados; desactívala en su lugar." },
        { status: 409 },
      );
    }
    console.error("DELETE /api/maintenance/asset-categories/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar la categoría." },
      { status: 500 },
    );
  }
}
