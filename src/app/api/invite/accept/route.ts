import { NextResponse, type NextRequest } from "next/server";
import { findPendingInvitation, acceptInvitation } from "@/modules/org/db/users";
import { hashPassword } from "@/lib/auth/password";
import { badRequest, notFound, parseBody, unprocessable } from "@/lib/api/handler";

interface AcceptBody {
  token?: unknown;
  password?: unknown;
}

const PASSWORD_MIN = 8;

/** POST /api/invite/accept — set a password and activate the pre-provisioned
 *  user identified by the one-time invitation token. Public (the token is the
 *  credential for this single action).
 *
 *  Not built on `handleRoute`: this endpoint has no auth guard (the token
 *  itself is the credential), and its two validation failures return
 *  different statuses (400 for a missing token, 422 for a short password) —
 *  `parseBody`'s schema mode always maps a failed `safeParse` to 422, so the
 *  fields are validated by hand instead, exactly as the original handler did.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody<AcceptBody>(request);
  if (body instanceof NextResponse) return body;

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) {
    return badRequest("Token requerido.");
  }
  if (password.length < PASSWORD_MIN) {
    return unprocessable(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
  }

  try {
    const inv = await findPendingInvitation(token);
    if (!inv) {
      return notFound("Invitación inválida o expirada.");
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
