import { NextResponse, type NextRequest } from "next/server";
import {
  getUserDetail,
  updateUserAssignments,
  bumpTokenVersion,
} from "@/modules/org/db/users";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(idStr: string | undefined): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** GET /api/users/[id] — user detail with full assignments (admin). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireAnyRole(["admin"]);
    const user = await getUserDetail(id);
    if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    return NextResponse.json({ user });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface UpdateBody {
  role_ids?: unknown;
  plant_ids?: unknown;
  department_ids?: unknown;
  all_plants?: unknown;
  is_active?: unknown;
  email?: unknown;
  display_name?: unknown;
  invalidate_sessions?: unknown;
}

/** PATCH /api/users/[id] — update assignments / activation / profile (admin). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let body: UpdateBody;
  try {
    body = (await parseJsonBody(request)) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  try {
    await requirePermission("org.user:update");
    await updateUserAssignments(id, {
      role_ids: Array.isArray(body.role_ids) ? asIdArray(body.role_ids) : undefined,
      plant_ids: Array.isArray(body.plant_ids) ? asIdArray(body.plant_ids) : undefined,
      department_ids: Array.isArray(body.department_ids)
        ? asIdArray(body.department_ids)
        : undefined,
      all_plants: typeof body.all_plants === "boolean" ? body.all_plants : undefined,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
      email: body.email === null ? null : typeof body.email === "string" ? body.email.trim() || null : undefined,
      display_name:
        body.display_name === null
          ? null
          : typeof body.display_name === "string"
            ? body.display_name.trim() || null
            : undefined,
    });
    if (body.invalidate_sessions === true) {
      await bumpTokenVersion(id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PATCH /api/users/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 500 });
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