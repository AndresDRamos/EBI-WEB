import { NextResponse, type NextRequest } from "next/server";
import { listDepartments, createDepartment } from "@/modules/org/db/org";
import { requireUser, requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/departments — list departments (any authenticated user). */
export async function GET() {
  try {
    await requireUser();
    const departments = await listDepartments();
    return NextResponse.json({ departments });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  name?: unknown;
  description?: unknown;
}

/** POST /api/departments — create a department (admin). */
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
  try {
    await requireAnyRole(["admin"]);
    const department = await createDepartment({ name, description });
    return NextResponse.json({ department }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El departamento ya existe." }, { status: 409 });
    }
    console.error("POST /api/departments failed:", err);
    return NextResponse.json({ error: "No se pudo crear el departamento." }, { status: 500 });
  }
}