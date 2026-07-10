import { NextResponse, type NextRequest } from "next/server";
import { findAssignmentById, closeAssignment } from "@/modules/production/db";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseId } from "@/lib/api/handler";

/** POST /api/production/assignments/[id]/close — end a current assignment
 * (sets valid_to). 404 when the row doesn't exist, 409 when already closed. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("production.assignment:close"),
      fail: "No se pudo cerrar la asignación.",
      label: "POST /api/production/assignments/[id]/close",
    },
    async () => {
      const existing = await findAssignmentById(id);
      if (!existing) return notFound("Asignación no encontrada.");
      if (existing.valid_to !== null) return conflict("La asignación ya está cerrada.");
      const closed = await closeAssignment(id);
      if (!closed) {
        // Raced with another close between the check and the update.
        return conflict("La asignación ya está cerrada.");
      }
      return NextResponse.json({ ok: true });
    },
  );
}
