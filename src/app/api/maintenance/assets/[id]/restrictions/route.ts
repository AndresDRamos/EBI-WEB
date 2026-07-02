import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetById,
  listRestrictionsByAsset,
  createRestriction,
  RESTRICTION_TYPES,
} from "@/modules/maintenance/db";
import { requireUser, requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/maintenance/assets/[id]/restrictions — list (any authenticated user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const restrictions = await listRestrictionsByAsset(id);
    return NextResponse.json({ restrictions });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  restriction_type?: unknown;
  description?: unknown;
}

/** POST /api/maintenance/assets/[id]/restrictions — create (admin). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const type = typeof body.restriction_type === "string" ? body.restriction_type : "";
  if (!(RESTRICTION_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Tipo de restricción inválido." }, { status: 422 });
  }
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "Descripción requerida." }, { status: 422 });
  }
  try {
    await requireAnyRole(["admin"]);
    const asset = await findAssetById(id);
    if (!asset) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
    }
    const restriction = await createRestriction({
      asset_id: id,
      restriction_type: type,
      description,
    });
    return NextResponse.json({ restriction }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/maintenance/assets/[id]/restrictions failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear la restricción." },
      { status: 500 },
    );
  }
}
