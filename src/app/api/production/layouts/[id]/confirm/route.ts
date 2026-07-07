import { NextResponse, type NextRequest } from "next/server";
import { activateDraft } from "@/modules/production/db/layout";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/**
 * POST /api/production/layouts/[id]/confirm — activate a draft. ONE
 * transaction: archives the plant's previous active version, closes its open
 * placements and re-opens them on the new version (carry-forward, approved
 * 2026-07-06).
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
    const user = await requirePermission("production.layout:activate");
    const result = await activateDraft(id, user.id);
    if (result.outcome === "not-found") {
      return NextResponse.json({ error: "Layout no encontrado." }, { status: 404 });
    }
    if (result.outcome === "not-draft") {
      return NextResponse.json(
        { error: "Solo se puede confirmar un borrador." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      layout: { ...result.layout, geometry: JSON.parse(result.layout.geometry) },
      carried_placements: result.carriedPlacements,
    });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/production/layouts/[id]/confirm failed:", err);
    return NextResponse.json(
      { error: "No se pudo activar el layout." },
      { status: 500 },
    );
  }
}
