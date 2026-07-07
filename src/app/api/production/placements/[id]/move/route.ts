import { NextResponse, type NextRequest } from "next/server";
import { findPlacementById, movePose } from "@/modules/production/db/placement";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

interface MoveBody {
  x_m?: unknown;
  y_m?: unknown;
  rotation_deg?: unknown;
  note?: unknown;
}

/**
 * POST /api/production/placements/[id]/move — historized reposition (close +
 * insert in one transaction; x/y/rotation are NEVER updated in place).
 * Requires BOTH placement permissions — it closes AND creates, mirroring the
 * assignment `reassign` gate.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  let body: MoveBody;
  try {
    body = (await parseJsonBody(request)) as MoveBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const x = Number(body.x_m);
  const y = Number(body.y_m);
  const rotation = body.rotation_deg == null ? 0 : Number(body.rotation_deg);
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
    await requirePermission("production.placement:close");
    const user = await requirePermission("production.placement:create");
    const source = await findPlacementById(id);
    if (!source) {
      return NextResponse.json(
        { error: "Colocación no encontrada." },
        { status: 404 },
      );
    }
    const placement = await movePose({
      placement_id: id,
      x_m: x,
      y_m: y,
      rotation_deg: rotation,
      note: typeof body.note === "string" ? body.note : null,
      created_by: user.id,
    });
    if (!placement) {
      return NextResponse.json(
        { error: "La colocación ya está cerrada." },
        { status: 409 },
      );
    }
    return NextResponse.json({ placement });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/production/placements/[id]/move failed:", err);
    return NextResponse.json(
      { error: "No se pudo mover la colocación." },
      { status: 500 },
    );
  }
}
