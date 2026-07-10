import { NextResponse, type NextRequest } from "next/server";
import { discardDraft, findLayoutById } from "@/modules/production/db/layout";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseId } from "@/lib/api/handler";

/** GET /api/production/layouts/[id] — full layout with parsed geometry (any user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar el layout.", label: "GET /api/production/layouts/[id]" },
    async () => {
      const layout = await findLayoutById(id);
      if (!layout) return notFound("Layout no encontrado.");
      return NextResponse.json({
        layout: { ...layout, geometry: JSON.parse(layout.geometry) },
      });
    },
  );
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
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("production.layout:create"),
      fail: "No se pudo descartar el borrador.",
      label: "DELETE /api/production/layouts/[id]",
    },
    async () => {
      const result = await discardDraft(id);
      if (result.outcome === "not-found") return notFound("Layout no encontrado.");
      if (result.outcome === "not-draft") {
        return conflict("Solo se puede descartar un borrador.");
      }
      return NextResponse.json({ ok: true });
    },
  );
}
