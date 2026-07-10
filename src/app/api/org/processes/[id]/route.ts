import { NextResponse, type NextRequest } from "next/server";
import {
  findProcessById,
  updateProcess,
  deleteProcess,
} from "@/modules/org/db/processes";
import { updateProcessSchema } from "@/modules/org/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** PUT /api/org/processes/[id] — update a process (admin panel). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateProcessSchema);
  if (body instanceof NextResponse) return body;

  const changes: Parameters<typeof updateProcess>[1] = {};
  if (body.code !== undefined) changes.code = body.code;
  if (body.name !== undefined) changes.name = body.name;
  if (body.description !== undefined) changes.description = body.description;
  if (body.is_active !== undefined) changes.is_active = body.is_active;

  return handleRoute(
    {
      guard: () => requirePermission("org.process:update"),
      uniqueFallback: "El código ya existe.",
      fail: "No se pudo actualizar el proceso.",
      label: "PUT /api/org/processes/[id]",
    },
    async () => {
      if (!(await findProcessById(id))) return notFound("Proceso no encontrado.");
      await updateProcess(id, changes);
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/org/processes/[id] — hard delete (admin); 409 if assets or
 * plants still link it. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      // The original handler treated any non-auth failure from deleteProcess
      // as an FK conflict (no `unique`/message inspection) — a catch-all rule
      // preserves that behavior instead of falling through to the 500 `fail`.
      guard: () => requirePermission("org.process:delete"),
      uniqueRules: [
        {
          pattern: /.*/,
          message: "No se pudo eliminar el proceso (¿tiene equipos o plantas vinculados?).",
        },
      ],
      fail: "No se pudo eliminar el proceso (¿tiene equipos o plantas vinculados?).",
      label: "DELETE /api/org/processes/[id]",
    },
    async () => {
      if (!(await findProcessById(id))) return notFound("Proceso no encontrado.");
      await deleteProcess(id);
      return NextResponse.json({ ok: true });
    },
  );
}
