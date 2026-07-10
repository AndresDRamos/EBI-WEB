import { NextResponse, type NextRequest } from "next/server";
import {
  listUsers,
  createUser,
  listPendingInvitations,
  createInvitation,
} from "@/modules/org/db/users";
import { listRoles, listPlants, listDepartments } from "@/modules/org/db/org";
import { requireAnyRole, requirePermission, requireUser } from "@/lib/auth/rbac";
import { createUserSchema } from "@/modules/org/schemas";
import { created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/users — list users + pending invitations (admin). */
export async function GET() {
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudo cargar la lista de usuarios.",
      label: "GET /api/users",
    },
    async () => {
      const [users, invitations, roles, plants, departments] = await Promise.all([
        listUsers(),
        listPendingInvitations(),
        listRoles(),
        listPlants(),
        listDepartments(),
      ]);
      return NextResponse.json({ users, invitations, roles, plants, departments });
    },
  );
}

/** POST /api/users — create a pre-provisioned user; optionally issue an
 *  invitation and return the one-time link token to show in the admin UI. */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createUserSchema);
  if (body instanceof NextResponse) return body;
  const { username, email, display_name, all_plants, role_ids, plant_ids, department_ids, invite } =
    body;

  return handleRoute(
    {
      guard: () => requirePermission("org.user:create"),
      // 23505 = unique violation (tedious surfaces as "Violation of UNIQUE KEY").
      uniqueRules: [{ pattern: /unique|username/i, message: "El usuario ya existe." }],
      fail: "No se pudo crear el usuario.",
      label: "POST /api/users",
    },
    async (admin) => {
      const userId = await createUser({
        username,
        email,
        display_name,
        all_plants,
        role_ids,
        plant_ids,
        department_ids,
        created_by: admin.id,
      });

      let inviteToken: string | null = null;
      if (invite) {
        inviteToken = await createInvitation(userId, admin.id);
      }

      return created({ user_id: userId, invite_token: inviteToken });
    },
  );
}

export { requireUser };
