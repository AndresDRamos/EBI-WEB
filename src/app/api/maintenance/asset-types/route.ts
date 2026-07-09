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
  code_prefix?: unknown;
  /** Process links (N:M in DB; the UI sends 0 or 1 for now). */
  process_ids?: unknown;
}

/** POST /api/maintenance/asset-types — create a type under a category, with
 * its matrícula prefix (V18) and optional process link. */
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
  const prefix =
    typeof body.code_prefix === "string" ? body.code_prefix.trim() : "";
  if (!Number.isInteger(categoryId) || categoryId <= 0 || !code || !name) {
    return NextResponse.json(
      { error: "Categoría, código y nombre son obligatorios." },
      { status: 422 },
    );
  }
  if (!/^[A-Za-z0-9]{2,8}$/.test(prefix)) {
    return NextResponse.json(
      { error: "El prefijo de matrícula debe tener de 2 a 8 caracteres alfanuméricos." },
      { status: 422 },
    );
  }
  let processIds: number[] = [];
  if (body.process_ids !== undefined) {
    if (
      !Array.isArray(body.process_ids) ||
      body.process_ids.some((p) => !Number.isInteger(p) || (p as number) <= 0)
    ) {
      return NextResponse.json({ error: "Procesos inválidos." }, { status: 422 });
    }
    processIds = body.process_ids as number[];
  }
  try {
    await requirePermission("maintenance.asset_type:create");
    const type = await createAssetType({
      asset_category_id: categoryId,
      code,
      name,
      code_prefix: prefix,
      process_ids: processIds,
    });
    return NextResponse.json({ type }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/UQ_asset_type_prefix/i.test(msg)) {
      return NextResponse.json(
        { error: "Ese prefijo de matrícula ya lo usa otro tipo." },
        { status: 409 },
      );
    }
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
