import { NextResponse, type NextRequest } from "next/server";
import { listRoles, createRole } from "@/modules/org/db/org";
import { createRoleSchema } from "@/modules/org/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/roles — list roles (any authenticated user). Returns is_active + description. */
export async function GET() {
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo cargar la lista de roles.",
      label: "GET /api/roles",
    },
    async () => {
      const roles = await listRoles();
      return NextResponse.json({ roles });
    },
  );
}

/** POST /api/roles — create an access profile. `department_id` scopes it to a
 * department (NULL = cross-department, like `admin`) — plan 0006 / ADR 0004. */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createRoleSchema);
  if (body instanceof NextResponse) return body;
  const { name, description, department_id } = body;

  return handleRoute(
    {
      guard: () => requirePermission("org.role:create"),
      uniqueFallback: "El rol ya existe.",
      fail: "No se pudo crear el rol.",
      label: "POST /api/roles",
    },
    async () => {
      const role = await createRole({ name, description, department_id });
      return created({ role });
    },
  );
}
