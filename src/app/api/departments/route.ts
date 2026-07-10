import { NextResponse, type NextRequest } from "next/server";
import { listDepartments, createDepartment } from "@/modules/org/db/org";
import { createDepartmentSchema } from "@/modules/org/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/departments — list departments (any authenticated user). */
export async function GET() {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la lista de departamentos.", label: "GET /api/departments" },
    async () => {
      const departments = await listDepartments();
      return NextResponse.json({ departments });
    },
  );
}

/** POST /api/departments — create a department (admin). */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createDepartmentSchema);
  if (body instanceof NextResponse) return body;
  const { name, description } = body;

  return handleRoute(
    {
      guard: () => requirePermission("org.department:create"),
      uniqueFallback: "El departamento ya existe.",
      fail: "No se pudo crear el departamento.",
      label: "POST /api/departments",
    },
    async () => {
      const department = await createDepartment({ name, description });
      return created({ department });
    },
  );
}
