import { NextResponse, type NextRequest } from "next/server";
import { createInvitation, findAuthUserById } from "@/modules/org/db/users";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/** POST /api/users/[id]/invite — issue a fresh one-time invitation for an
 *  existing (pre-provisioned) user. Returns the raw token to show once. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    const admin = await requirePermission("org.user:invite");
    const user = await findAuthUserById(id);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }
    const token = await createInvitation(id, admin.id);
    return NextResponse.json({ invite_token: token });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/users/[id]/invite failed:", err);
    return NextResponse.json({ error: "No se pudo generar la invitación." }, { status: 500 });
  }
}