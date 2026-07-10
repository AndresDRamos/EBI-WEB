import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { deleteItem, findItemById, findSectionById, updateItem } from "@/modules/navigation/db";
import { updateNavItemSchema } from "@/modules/navigation/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/**
 * PUT /api/nav/items/[id] — update a sidebar item (admin). If `href` changes,
 * it's re-validated against the item's (unchangeable) section base_path.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const changes = await parseBody(request, updateNavItemSchema);
  if (changes instanceof NextResponse) return changes;

  return handleRoute(
    {
      guard: () => requirePermission("navigation.item:update"),
      uniqueFallback: "Ya existe un ítem con esa ruta en la sección.",
      fail: "No se pudo actualizar el ítem.",
      label: "PUT /api/nav/items/[id]",
    },
    async () => {
      const current = await findItemById(id);
      if (!current) return notFound("Ítem no encontrado.");
      if (changes.href !== undefined) {
        const section = await findSectionById(current.section_id);
        if (section && !changes.href.startsWith(section.base_path)) {
          return unprocessable(`La ruta debe empezar con '${section.base_path}'.`);
        }
      }
      if (Object.keys(changes).length === 0) {
        return unprocessable("Sin cambios.");
      }
      await updateItem(id, changes);
      revalidateTag("nav", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}

/** DELETE /api/nav/items/[id] — hard delete. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");

  return handleRoute(
    {
      guard: () => requirePermission("navigation.item:delete"),
      fail: "No se pudo eliminar el ítem.",
      label: "DELETE /api/nav/items/[id]",
    },
    async () => {
      const current = await findItemById(id);
      if (!current) return notFound("Ítem no encontrado.");
      await deleteItem(id);
      revalidateTag("nav", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}
