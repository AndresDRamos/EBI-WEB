import { NextResponse, type NextRequest } from "next/server";
import {
  getUserDetail,
  updateUserAssignments,
  bumpTokenVersion,
} from "@/modules/org/db/users";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { updateUserSchema } from "@/modules/org/schemas";
import { badRequest, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** GET /api/users/[id] — user detail with full assignments (admin). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudo cargar el usuario.",
      label: "GET /api/users/[id]",
    },
    async () => {
      const user = await getUserDetail(id);
      if (!user) return notFound("Usuario no encontrado.");
      return NextResponse.json({ user });
    },
  );
}

/** PATCH /api/users/[id] — update assignments / activation / profile (admin). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return badRequest("ID inválido.");

  const body = await parseBody(request, updateUserSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("org.user:update"),
      fail: "No se pudo actualizar el usuario.",
      label: "PATCH /api/users/[id]",
    },
    async () => {
      const { invalidate_sessions, ...assignments } = body;
      await updateUserAssignments(id, assignments);
      if (invalidate_sessions) {
        await bumpTokenVersion(id);
      }
      return NextResponse.json({ ok: true });
    },
  );
}
