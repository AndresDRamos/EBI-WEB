import { NextResponse, type NextRequest } from "next/server";
import { listRoles, createRole } from "@/modules/org/db/org";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/roles — list roles (any authenticated user). Returns is_active + description. */
export async function GET() {
  try {
    await requireUser();
    const roles = await listRoles();
    return NextResponse.json({ roles });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  name?: unknown;
  description?: unknown;
  department_id?: unknown;
}

/** POST /api/roles — create an access profile. `department_id` scopes it to a
 * department (NULL = cross-department, like `admin`) — plan 0006 / ADR 0004. */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 422 });
  }
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const department_id =
    body.department_id === null || body.department_id === undefined
      ? null
      : Number(body.department_id);
  if (department_id !== null && (!Number.isInteger(department_id) || department_id <= 0)) {
    return NextResponse.json({ error: "Departamento inválido." }, { status: 422 });
  }
  try {
    await requirePermission("org.role:create");
    const role = await createRole({ name, description, department_id });
    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El rol ya existe." }, { status: 409 });
    }
    console.error("POST /api/roles failed:", err);
    return NextResponse.json({ error: "No se pudo crear el rol." }, { status: 500 });
  }
}