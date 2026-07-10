import { NextResponse, type NextRequest } from "next/server";
import { updateLocation, deleteLocation } from "@/modules/org/db/locations";
import { updateLocationSchema } from "@/modules/org/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, parseBody, parseId } from "@/lib/api/handler";

/** PUT /api/org/locations/[id] — update a location. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateLocationSchema);
  if (body instanceof NextResponse) return body;

  const changes: Parameters<typeof updateLocation>[1] = {};
  if (body.code !== undefined) changes.code = body.code;
  if (body.name !== undefined) changes.name = body.name;
  if (body.is_active !== undefined) changes.is_active = body.is_active;

  return handleRoute(
    {
      guard: () => requirePermission("org.location:update"),
      uniqueFallback: "El código ya existe en esa planta.",
      fail: "No se pudo actualizar la ubicación.",
      label: "PUT /api/org/locations/[id]",
    },
    async () => {
      await updateLocation(id, changes);
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/org/locations/[id] — hard delete; 409 if referenced. */
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
      guard: () => requirePermission("org.location:delete"),
      uniqueRules: [
        {
          pattern: /.*/,
          message: "No se pudo eliminar la ubicación (¿tiene equipos o celdas asignados?).",
        },
      ],
      fail: "No se pudo eliminar la ubicación (¿tiene equipos o celdas asignados?).",
      label: "DELETE /api/org/locations/[id]",
    },
    async () => {
      await deleteLocation(id);
      return NextResponse.json({ ok: true });
    },
  );
}
