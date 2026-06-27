import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";
import {
  findAuthUserById,
  setUserPassword,
  bumpTokenVersion,
} from "@/lib/db/users";
import {
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";

interface ChangePasswordBody {
  current_password?: unknown;
  new_password?: unknown;
}

/**
 * POST /api/profile/password — self-service password change for any
 * authenticated user. Verifies the current password against the stored hash,
 * sets the new hash (without re-activating), and bumps token_version so other
 * outstanding JWTs (other tabs, other devices) become invalid on their next
 * request.
 */
export async function POST(request: NextRequest) {
  let body: ChangePasswordBody;
  try {
    body = (await parseJsonBody(request)) as ChangePasswordBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const current =
    typeof body.current_password === "string" ? body.current_password : "";
  const next =
    typeof body.new_password === "string" ? body.new_password : "";

  if (!current || !next) {
    return NextResponse.json(
      { error: "Debes enviar la contraseña actual y la nueva." },
      { status: 422 },
    );
  }
  if (next.length < 8) {
    return NextResponse.json(
      { error: "La nueva contraseña debe tener al menos 8 caracteres." },
      { status: 422 },
    );
  }

  try {
    const user = await requireUser();
    const auth = await findAuthUserById(user.id);
    if (!auth) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }
    if (!auth.password_hash) {
      // Pre-provisioned users (no password yet) cannot change it themselves
      // — they must use an invitation.
      return NextResponse.json(
        { error: "La cuenta no tiene contraseña todavía; usa la invitación." },
        { status: 403 },
      );
    }
    const valid = await verifyPassword(current, auth.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "La contraseña actual no es correcta." },
        { status: 403 },
      );
    }
    const hash = await hashPassword(next);
    // activate=false: keep the activation flag untouched here — changing the
    // password is independent of being allowed to log in.
    await setUserPassword(user.id, hash, false);
    await bumpTokenVersion(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/profile/password failed:", err);
    return NextResponse.json(
      { error: "No se pudo cambiar la contraseña." },
      { status: 500 },
    );
  }
}