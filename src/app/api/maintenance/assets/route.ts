import { NextResponse, type NextRequest } from "next/server";
import {
  listAssets,
  createAsset,
  ASSET_STATUSES,
  ASSET_CRITICALITIES,
  ASSET_CATEGORIES,
} from "@/modules/maintenance/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/maintenance/assets — list assets (any authenticated user). */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = request.nextUrl.searchParams;
    const plantIdRaw = sp.get("plant_id");
    const plantId = plantIdRaw ? Number(plantIdRaw) : undefined;
    const status = sp.get("status") ?? undefined;
    const assets = await listAssets({
      plantId: Number.isInteger(plantId) ? plantId : undefined,
      status,
      activeOnly: sp.get("active") === "1",
    });
    return NextResponse.json({ assets });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  code?: unknown;
  name?: unknown;
  plant_id?: unknown;
  brand?: unknown;
  model?: unknown;
  serial_number?: unknown;
  location?: unknown;
  criticality?: unknown;
  status?: unknown;
  asset_category?: unknown;
  parent_asset_id?: unknown;
  acquisition_date?: unknown;
  notes?: unknown;
}

/** POST /api/maintenance/assets — create an asset (admin). */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const plantId = Number(body.plant_id);
  if (!code || !name || !Number.isInteger(plantId) || plantId <= 0) {
    return NextResponse.json(
      { error: "Código, nombre y planta son obligatorios." },
      { status: 422 },
    );
  }
  const criticality =
    typeof body.criticality === "string" ? body.criticality : undefined;
  if (
    criticality !== undefined &&
    !(ASSET_CRITICALITIES as readonly string[]).includes(criticality)
  ) {
    return NextResponse.json({ error: "Criticidad inválida." }, { status: 422 });
  }
  const status = typeof body.status === "string" ? body.status : undefined;
  if (
    status !== undefined &&
    !(ASSET_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json({ error: "Estatus inválido." }, { status: 422 });
  }
  const assetCategory =
    typeof body.asset_category === "string" ? body.asset_category : undefined;
  if (
    assetCategory !== undefined &&
    !(ASSET_CATEGORIES as readonly string[]).includes(assetCategory)
  ) {
    return NextResponse.json({ error: "Categoría inválida." }, { status: 422 });
  }
  const parentId =
    body.parent_asset_id == null ? null : Number(body.parent_asset_id);
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
    return NextResponse.json({ error: "Equipo padre inválido." }, { status: 422 });
  }
  const acquisitionDate = parseDateOrNull(body.acquisition_date);
  if (acquisitionDate === undefined) {
    return NextResponse.json(
      { error: "Fecha de adquisición inválida." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("maintenance.asset:create");
    const asset = await createAsset({
      code,
      name,
      plant_id: plantId,
      brand: strOrNull(body.brand),
      model: strOrNull(body.model),
      serial_number: strOrNull(body.serial_number),
      location: strOrNull(body.location),
      criticality,
      status,
      asset_category: assetCategory,
      parent_asset_id: parentId,
      acquisition_date: acquisitionDate,
      notes: strOrNull(body.notes),
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("POST /api/maintenance/assets failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear el equipo." },
      { status: 500 },
    );
  }
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** null/absent → null; valid yyyy-mm-dd → Date; anything else → undefined. */
function parseDateOrNull(v: unknown): Date | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
