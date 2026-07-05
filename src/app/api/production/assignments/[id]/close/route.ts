import { NextResponse, type NextRequest } from "next/server";
import { findAssignmentById, closeAssignment } from "@/modules/production/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** POST /api/production/assignments/[id]/close — end a current assignment
 * (sets valid_to). 404 when the row doesn't exist, 409 when already closed. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requirePermission("production.assignment:close");
    const existing = await findAssignmentById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Asignación no encontrada." },
        { status: 404 },
      );
    }
    if (existing.valid_to !== null) {
      return NextResponse.json(
        { error: "La asignación ya está cerrada." },
        { status: 409 },
      );
    }
    const closed = await closeAssignment(id);
    if (!closed) {
      // Raced with another close between the check and the update.
      return NextResponse.json(
        { error: "La asignación ya está cerrada." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/production/assignments/[id]/close failed:", err);
    return NextResponse.json(
      { error: "No se pudo cerrar la asignación." },
      { status: 500 },
    );
  }
}
