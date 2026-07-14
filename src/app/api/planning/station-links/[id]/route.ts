import { NextResponse, type NextRequest } from "next/server";
import { unlinkStation, LinkNotFoundError } from "@/modules/planning/db";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseId } from "@/lib/api/handler";

/** DELETE /api/planning/station-links/[id] — remove a cell ↔ station mapping. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("planning.station_link:manage"),
      fail: "No se pudo eliminar el enlace.",
      label: "DELETE /api/planning/station-links/[id]",
    },
    async () => {
      try {
        await unlinkStation(id);
        return NextResponse.json({ ok: true });
      } catch (err) {
        if (err instanceof LinkNotFoundError) return notFound(err.message);
        throw err;
      }
    },
  );
}
