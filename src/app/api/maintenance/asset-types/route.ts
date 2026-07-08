import { NextResponse, type NextRequest } from "next/server";
import { listAssetTypes, createAssetType } from "@/modules/maintenance/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/maintenance/asset-types — catalog list (any authenticated user). */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const activeOnly = request.nextUrl.searchParams.get("active") === "1";
    const types = await listAssetTypes(activeOnly);
    return NextResponse.json({ types });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  asset_category_id?: unknown;
  code?: unknown;
  name?: unknown;
}

/** POST /api/maintenance/asset-types — create a type under a category. */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const categoryId = Number(body.asset_category_id);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!Number.isInteger(categoryId) || categoryId <= 0 || !code || !name) {
    return NextResponse.json(
      { error: "Categoría, código y nombre son obligatorios." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("maintenance.asset_type:create");
    const type = await createAssetType({
      asset_category_id: categoryId,
      code,
      name,
    });
    return NextResponse.json({ type }, { status: 201 });
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
    if (/REFERENCE|FOREIGN KEY|conflicted/i.test(msg)) {
      return NextResponse.json({ error: "Categoría inválida." }, { status: 422 });
    }
    console.error("POST /api/maintenance/asset-types failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear el tipo." },
      { status: 500 },
    );
  }
}
