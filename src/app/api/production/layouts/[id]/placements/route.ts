import { NextResponse, type NextRequest } from "next/server";
import { findLayoutById } from "@/modules/production/db/layout";
import {
  createPlacement,
  listByLayout,
} from "@/modules/production/db/placement";
import { findAssetById } from "@/modules/maintenance/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * GET /api/production/layouts/[id]/placements?current=1 — placements of a
 * layout: current composition or full history (any authenticated user).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    if (!(await findLayoutById(id))) {
      return NextResponse.json({ error: "Layout no encontrado." }, { status: 404 });
    }
    const currentOnly = request.nextUrl.searchParams.get("current") === "1";
    const placements = await listByLayout(id, { currentOnly });
    return NextResponse.json({ placements });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  asset_id?: unknown;
  x_m?: unknown;
  y_m?: unknown;
  rotation_deg?: unknown;
  note?: unknown;
}

/**
 * POST /api/production/layouts/[id]/placements — place an asset on the layout.
 * Cross-schema invariant enforced here (V13 note): the asset's plant must be
 * the layout's plant → 422 otherwise.
 */
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
  const assetId = Number(body.asset_id);
  const x = Number(body.x_m);
  const y = Number(body.y_m);
  const rotation = body.rotation_deg == null ? 0 : Number(body.rotation_deg);
  if (!Number.isInteger(assetId) || assetId <= 0) {
    return NextResponse.json({ error: "Equipo inválido." }, { status: 422 });
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    return NextResponse.json({ error: "Posición inválida." }, { status: 422 });
  }
  if (!Number.isFinite(rotation) || rotation < 0 || rotation >= 360) {
    return NextResponse.json(
      { error: "Rotación inválida (0 ≤ grados < 360)." },
      { status: 422 },
    );
  }
  try {
    const user = await requirePermission("production.placement:create");
    const layout = await findLayoutById(id);
    if (!layout) {
      return NextResponse.json({ error: "Layout no encontrado." }, { status: 404 });
    }
    const asset = await findAssetById(assetId);
    if (!asset) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 422 });
    }
    if (asset.plant_id !== layout.plant_id) {
      return NextResponse.json(
        { error: "El equipo pertenece a otra planta." },
        { status: 422 },
      );
    }
    if (x > layout.width_m || y > layout.height_m) {
      return NextResponse.json(
        { error: "La posición cae fuera del lienzo del layout." },
        { status: 422 },
      );
    }
    const placement = await createPlacement({
      layout_id: id,
      asset_id: assetId,
      x_m: x,
      y_m: y,
      rotation_deg: rotation,
      note: typeof body.note === "string" ? body.note : null,
      created_by: user.id,
    });
    return NextResponse.json({ placement }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/UQ_asset_placement_current/i.test(msg) || /unique/i.test(msg)) {
      return NextResponse.json(
        { error: "El equipo ya está colocado en este layout." },
        { status: 409 },
      );
    }
    console.error("POST /api/production/layouts/[id]/placements failed:", err);
    return NextResponse.json(
      { error: "No se pudo colocar el equipo." },
      { status: 500 },
    );
  }
}
