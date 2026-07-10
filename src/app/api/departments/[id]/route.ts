import { NextResponse, type NextRequest } from "next/server";
import { updateDepartment, deleteDepartment } from "@/modules/org/db/org";
import { updateDepartmentSchema } from "@/modules/org/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, parseBody, parseId } from "@/lib/api/handler";

/** PUT /api/departments/[id] — update a department (admin). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateDepartmentSchema);
  if (body instanceof NextResponse) return body;

  const changes: Parameters<typeof updateDepartment>[1] = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.description !== undefined) changes.description = body.description;
  if (body.is_active !== undefined) changes.is_active = body.is_active;

  return handleRoute(
    {
      guard: () => requirePermission("org.department:update"),
      fail: "No se pudo actualizar el departamento.",
      label: "PUT /api/departments/[id]",
    },
    async () => {
      await updateDepartment(id, changes);
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/departments/[id] — delete a department (admin); 409 if referenced. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      // The original handler treated any non-auth failure here as an FK
      // conflict (no `unique`/message inspection) — a catch-all rule
      // preserves that behavior instead of falling through to the 500 `fail`.
      guard: () => requirePermission("org.department:delete"),
      uniqueRules: [
        {
          pattern: /.*/,
          message: "No se pudo eliminar el departamento (¿tiene usuarios asignados?).",
        },
      ],
      fail: "No se pudo eliminar el departamento (¿tiene usuarios asignados?).",
      label: "DELETE /api/departments/[id]",
    },
    async () => {
      await deleteDepartment(id);
      return NextResponse.json({ ok: true });
    },
  );
}
