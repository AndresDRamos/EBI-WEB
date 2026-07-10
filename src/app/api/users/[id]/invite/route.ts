import { NextResponse, type NextRequest } from "next/server";
import { createInvitation, findAuthUserById } from "@/modules/org/db/users";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseId } from "@/lib/api/handler";

/** POST /api/users/[id]/invite — issue a fresh one-time invitation for an
 *  existing (pre-provisioned) user. Returns the raw token to show once. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("org.user:invite"),
      fail: "No se pudo generar la invitación.",
      label: "POST /api/users/[id]/invite",
    },
    async (admin) => {
      const user = await findAuthUserById(id);
      if (!user) return notFound("Usuario no encontrado.");
      const token = await createInvitation(id, admin.id);
      return NextResponse.json({ invite_token: token });
    },
  );
}
