import { NextResponse, type NextRequest } from "next/server";
import {
  listAssets,
  createAsset,
  AssetTypeInvalidError,
  AssetCodeOverflowError,
  ASSET_STATUSES,
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
  name?: unknown;
  plant_id?: unknown;
  asset_type_id?: unknown;
  brand?: unknown;
  model?: unknown;
  serial_number?: unknown;
  status?: unknown;
  parent_asset_id?: unknown;
  installation_date?: unknown;
  image_blob_path?: unknown;
  notes?: unknown;
}

/**
 * POST /api/maintenance/assets — create an asset. The matrícula (`code`) is
 * auto-generated server-side from the type's category prefix + plant; the
 * client never sends it.
 */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const plantId = Number(body.plant_id);
  const assetTypeId = Number(body.asset_type_id);
  if (!name || !Number.isInteger(plantId) || plantId <= 0) {
    return NextResponse.json(
      { error: "Nombre y planta son obligatorios." },
      { status: 422 },
    );
  }
  if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
    return NextResponse.json(
      { error: "El tipo de equipo es obligatorio." },
      { status: 422 },
    );
  }
  const status = typeof body.status === "string" ? body.status : undefined;
  if (
    status !== undefined &&
    !(ASSET_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json({ error: "Estatus inválido." }, { status: 422 });
  }
  const parentId =
    body.parent_asset_id == null ? null : Number(body.parent_asset_id);
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
    return NextResponse.json({ error: "Equipo padre inválido." }, { status: 422 });
  }
  const installationDate = parseDateOrNull(body.installation_date);
  if (installationDate === undefined) {
    return NextResponse.json(
      { error: "Fecha de instalación inválida." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("maintenance.asset:create");
    const asset = await createAsset({
      name,
      plant_id: plantId,
      asset_type_id: assetTypeId,
      brand: strOrNull(body.brand),
      model: strOrNull(body.model),
      serial_number: strOrNull(body.serial_number),
      status,
      parent_asset_id: parentId,
      installation_date: installationDate,
      image_blob_path: strOrNull(body.image_blob_path),
      notes: strOrNull(body.notes),
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    if (err instanceof AssetTypeInvalidError || err instanceof AssetCodeOverflowError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: "El código generado ya existe, reintenta." },
        { status: 409 },
      );
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
