import { NextResponse, type NextRequest } from "next/server";
import { discardDraft, findLayoutById } from "@/modules/production/db/layout";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/production/layouts/[id] — full layout with parsed geometry (any user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const layout = await findLayoutById(id);
    if (!layout) {
      return NextResponse.json({ error: "Layout no encontrado." }, { status: 404 });
    }
    return NextResponse.json({
      layout: { ...layout, geometry: JSON.parse(layout.geometry) },
    });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

/**
 * DELETE /api/production/layouts/[id] — discard a DRAFT (its trial placements
 * go with it). Active/archived versions are history: 409.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requirePermission("production.layout:create");
    const result = await discardDraft(id);
    if (result.outcome === "not-found") {
      return NextResponse.json({ error: "Layout no encontrado." }, { status: 404 });
    }
    if (result.outcome === "not-draft") {
      return NextResponse.json(
        { error: "Solo se puede descartar un borrador." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/production/layouts/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo descartar el borrador." },
      { status: 500 },
    );
  }
}
