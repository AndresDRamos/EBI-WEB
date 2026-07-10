import { NextResponse, type NextRequest } from "next/server";
import { findPendingInvitation, acceptInvitation } from "@/modules/org/db/users";
import { hashPassword } from "@/lib/auth/password";
import { parseJsonBody } from "@/lib/auth/api";

interface AcceptBody {
  token?: unknown;
  password?: unknown;
}

const PASSWORD_MIN = 8;

/** POST /api/invite/accept — set a password and activate the pre-provisioned
 *  user identified by the one-time invitation token. Public (the token is the
 *  credential for this single action). */
export async function POST(request: NextRequest) {
  let body: AcceptBody;
  try {
    body = (await parseJsonBody(request)) as AcceptBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) {
    return NextResponse.json({ error: "Token requerido." }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json(
      { error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` },
      { status: 422 },
    );
  }

  try {
    const inv = await findPendingInvitation(token);
    if (!inv) {
      return NextResponse.json({ error: "Invitación inválida o expirada." }, { status: 404 });
    }
    const hash = await hashPassword(password);
    await acceptInvitation(inv.invitation_id, hash);
    return NextResponse.json({ ok: true, username: inv.username });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/invitación/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("POST /api/invite/accept failed:", err);
    return NextResponse.json({ error: "No se pudo completar el registro." }, { status: 500 });
  }
}