import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/rbac";
import {
  findAuthUserById,
  setUserPassword,
  bumpTokenVersion,
} from "@/modules/org/db/users";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/modules/org/schemas";
import { handleRoute, notFound, parseBody } from "@/lib/api/handler";

/**
 * POST /api/profile/password — self-service password change for any
 * authenticated user. Verifies the current password against the stored hash,
 * sets the new hash (without re-activating), and bumps token_version so other
 * outstanding JWTs (other tabs, other devices) become invalid on their next
 * request.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, changePasswordSchema);
  if (body instanceof NextResponse) return body;
  const { current_password, new_password } = body;

  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo cambiar la contraseña.",
      label: "POST /api/profile/password",
    },
    async (user) => {
      const auth = await findAuthUserById(user.id);
      if (!auth) return notFound("Usuario no encontrado.");
      if (!auth.password_hash) {
        // Pre-provisioned users (no password yet) cannot change it themselves
        // — they must use an invitation.
        return NextResponse.json(
          { error: "La cuenta no tiene contraseña todavía; usa la invitación." },
          { status: 403 },
        );
      }
      const valid = await verifyPassword(current_password, auth.password_hash);
      if (!valid) {
        return NextResponse.json(
          { error: "La contraseña actual no es correcta." },
          { status: 403 },
        );
      }
      const hash = await hashPassword(new_password);
      // activate=false: keep the activation flag untouched here — changing the
      // password is independent of being allowed to log in.
      await setUserPassword(user.id, hash, false);
      await bumpTokenVersion(user.id);
      return NextResponse.json({ ok: true });
    },
  );
}
