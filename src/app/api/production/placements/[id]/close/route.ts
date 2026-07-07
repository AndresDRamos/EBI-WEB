import { NextResponse, type NextRequest } from "next/server";
import {
  closePlacement,
  findPlacementById,
} from "@/modules/production/db/placement";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/**
 * POST /api/production/placements/[id]/close — end a placement (sets
 * valid_to). Missing row → 404; already closed → 409.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requirePermission("production.placement:close");
    if (!(await findPlacementById(id))) {
      return NextResponse.json(
        { error: "Colocación no encontrada." },
        { status: 404 },
      );
    }
    const closed = await closePlacement(id);
    if (!closed) {
      return NextResponse.json(
        { error: "La colocación ya está cerrada." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/production/placements/[id]/close failed:", err);
    return NextResponse.json(
      { error: "No se pudo cerrar la colocación." },
      { status: 500 },
    );
  }
}
