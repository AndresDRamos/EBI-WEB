import { NextResponse, type NextRequest } from "next/server";
import {
  listUsers,
  createUser,
  listPendingInvitations,
  createInvitation,
} from "@/lib/db/users";
import { listRoles, listPlants, listDepartments } from "@/lib/db/org";
import { requireAnyRole, requireUser } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/users — list users + pending invitations (admin). */
export async function GET() {
  try {
    await requireAnyRole(["admin"]);
    const [users, invitations, roles, plants, departments] = await Promise.all([
      listUsers(),
      listPendingInvitations(),
      listRoles(),
      listPlants(),
      listDepartments(),
    ]);
    return NextResponse.json({ users, invitations, roles, plants, departments });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateUserBody {
  username?: unknown;
  email?: unknown;
  display_name?: unknown;
  all_plants?: unknown;
  role_ids?: unknown;
  plant_ids?: unknown;
  department_ids?: unknown;
  invite?: unknown;
}

/** POST /api/users — create a pre-provisioned user; optionally issue an
 *  invitation and return the one-time link token to show in the admin UI. */
export async function POST(request: NextRequest) {
  let body: CreateUserBody;
  try {
    body = (await parseJsonBody(request)) as CreateUserBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const username =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!username) {
    return NextResponse.json({ error: "El usuario es obligatorio." }, { status: 422 });
  }
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
    return NextResponse.json(
      { error: "Usuario inválido (3-64 chars: a-z 0-9 . _ -)." },
      { status: 422 },
    );
  }

  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  const display_name =
    typeof body.display_name === "string" && body.display_name.trim()
      ? body.display_name.trim()
      : null;
  const all_plants = body.all_plants === true;
  const role_ids = asIdArray(body.role_ids);
  const plant_ids = asIdArray(body.plant_ids);
  const department_ids = asIdArray(body.department_ids);
  const invite = body.invite !== false;

  try {
    const admin = await requireAnyRole(["admin"]);
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

    return NextResponse.json({ user_id: userId, invite_token: inviteToken }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "No se pudo crear el usuario.";
    // 23505 = unique violation (tedious surfaces as "Violation of UNIQUE KEY").
    if (/unique/i.test(msg) || /username/i.test(msg)) {
      return NextResponse.json({ error: "El usuario ya existe." }, { status: 409 });
    }
    console.error("POST /api/users failed:", err);
    return NextResponse.json({ error: "No se pudo crear el usuario." }, { status: 500 });
  }
}

function asIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  return out;
}

export { requireUser };