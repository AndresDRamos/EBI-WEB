import { NextResponse, type NextRequest } from "next/server";
import { archiveActive } from "@/modules/production/db/layout";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/**
 * POST /api/production/layouts/[id]/archive — retire the ACTIVE layout
 * without a successor (its open placements close; the plant has no canvas).
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
    await requirePermission("production.layout:archive");
    const result = await archiveActive(id);
    if (result.outcome === "not-found") {
      return NextResponse.json({ error: "Layout no encontrado." }, { status: 404 });
    }
    if (result.outcome === "not-active") {
      return NextResponse.json(
        { error: "Solo se puede archivar el layout activo." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      closed_placements: result.closedPlacements,
    });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/production/layouts/[id]/archive failed:", err);
    return NextResponse.json(
      { error: "No se pudo archivar el layout." },
      { status: 500 },
    );
  }
}
