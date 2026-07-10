import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findSectionById, updateSection, deleteSection } from "@/modules/navigation/db";
import { updateNavSectionSchema } from "@/modules/navigation/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/**
 * PUT /api/navigation/nav/sections/[id] — update label / icon / sort_order / is_active
 * (admin). `base_path` and `code` are not accepted: routes are owned by code,
 * not the admin panel.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const changes = await parseBody(request, updateNavSectionSchema);
  if (changes instanceof NextResponse) return changes;

  return handleRoute(
    {
      guard: () => requirePermission("navigation.section:update"),
      fail: "No se pudo actualizar la sección.",
      label: "PUT /api/navigation/nav/sections/[id]",
    },
    async () => {
      const current = await findSectionById(id);
      if (!current) return notFound("Sección no encontrada.");
      if (Object.keys(changes).length === 0) {
        return unprocessable("Sin cambios.");
      }
      await updateSection(id, changes);
      revalidateTag("nav", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/navigation/nav/sections/[id] — hard delete; cascades items + grants (V7). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");

  return handleRoute(
    {
      guard: () => requirePermission("navigation.section:delete"),
      fail: "No se pudo eliminar la sección.",
      label: "DELETE /api/navigation/nav/sections/[id]",
    },
    async () => {
      const current = await findSectionById(id);
      if (!current) return notFound("Sección no encontrada.");
      await deleteSection(id);
      revalidateTag("nav", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}
