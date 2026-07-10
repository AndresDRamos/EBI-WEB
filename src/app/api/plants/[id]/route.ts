import { NextResponse, type NextRequest } from "next/server";
import { updatePlant, deletePlant } from "@/modules/org/db/org";
import { updatePlantSchema } from "@/modules/org/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, parseBody, parseId } from "@/lib/api/handler";

/** PUT /api/plants/[id] — update a plant (admin). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updatePlantSchema);
  if (body instanceof NextResponse) return body;

  const changes: Parameters<typeof updatePlant>[1] = {};
  if (body.code !== undefined) changes.code = body.code;
  if (body.name !== undefined) changes.name = body.name;
  if (body.address !== undefined) changes.address = body.address;
  if (body.postal_code !== undefined) changes.postal_code = body.postal_code;
  if (body.is_active !== undefined) changes.is_active = body.is_active;

  return handleRoute(
    {
      guard: () => requirePermission("org.plant:update"),
      uniqueFallback: "El código ya existe.",
      fail: "No se pudo actualizar la planta.",
      label: "PUT /api/plants/[id]",
    },
    async () => {
      await updatePlant(id, changes);
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/plants/[id] — hard delete a plant (admin); 409 if referenced. */
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
      guard: () => requirePermission("org.plant:delete"),
      uniqueRules: [
        {
          pattern: /.*/,
          message: "No se pudo eliminar la planta (¿tiene usuarios asignados?).",
        },
      ],
      fail: "No se pudo eliminar la planta (¿tiene usuarios asignados?).",
      label: "DELETE /api/plants/[id]",
    },
    async () => {
      await deletePlant(id);
      return NextResponse.json({ ok: true });
    },
  );
}
