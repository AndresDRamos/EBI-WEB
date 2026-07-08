import { NextResponse, type NextRequest } from "next/server";
import {
  listAssetCategories,
  createAssetCategory,
} from "@/modules/maintenance/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/maintenance/asset-categories — catalog list (any authenticated user). */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const activeOnly = request.nextUrl.searchParams.get("active") === "1";
    const categories = await listAssetCategories(activeOnly);
    return NextResponse.json({ categories });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  code?: unknown;
  name?: unknown;
  code_prefix?: unknown;
}

/** POST /api/maintenance/asset-categories — create a category. */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const prefix =
    typeof body.code_prefix === "string" ? body.code_prefix.trim() : "";
  if (!code || !name || !prefix) {
    return NextResponse.json(
      { error: "Código, nombre y prefijo son obligatorios." },
      { status: 422 },
    );
  }
  if (!/^[A-Za-z0-9]{2,8}$/.test(prefix)) {
    return NextResponse.json(
      { error: "El prefijo debe ser alfanumérico (2–8 caracteres)." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("maintenance.asset_category:create");
    const category = await createAssetCategory({
      code,
      name,
      code_prefix: prefix,
    });
    return NextResponse.json({ category }, { status: 201 });
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
    console.error("POST /api/maintenance/asset-categories failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear la categoría." },
      { status: 500 },
    );
  }
}
