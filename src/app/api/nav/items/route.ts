import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import {
  createItem,
  findSectionById,
  grantItemToSectionRoles,
  listItems,
} from "@/modules/navigation/db";
import { createNavItemSchema } from "@/modules/navigation/schemas";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, notFound, parseBody, unprocessable } from "@/lib/api/handler";

/** GET /api/nav/items — list every sidebar item across sections (admin). */
export async function GET() {
  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudieron cargar los ítems.",
      label: "GET /api/nav/items",
    },
    async () => {
      const items = await listItems();
      return NextResponse.json({ items });
    },
  );
}

/**
 * POST /api/nav/items — create a sidebar item under an existing section
 * (admin). `href` must live under the section's `base_path` — that cross-row
 * rule can't be a DB CHECK, so it's enforced here.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createNavItemSchema);
  if (body instanceof NextResponse) return body;
  const { section_id, parent_item_id, label, icon, href, sort_order } = body;

  return handleRoute(
    {
      guard: () => requirePermission("navigation.item:create"),
      uniqueFallback: "Ya existe un ítem con esa ruta en la sección.",
      fail: "No se pudo crear el ítem.",
      label: "POST /api/nav/items",
    },
    async () => {
      const section = await findSectionById(section_id);
      if (!section) return notFound("Sección no encontrada.");
      if (!href.startsWith(section.base_path)) {
        return unprocessable(`La ruta debe empezar con '${section.base_path}'.`);
      }
      const item = await createItem({
        section_id,
        parent_item_id,
        label,
        icon,
        href,
        sort_order,
      });
      // Page-granular visibility (ADR 0008): a new page would otherwise be
      // invisible to everyone until re-granted. Grant it to every role that
      // already sees this section, so it shows up where the section already does.
      await grantItemToSectionRoles(section_id, item.item_id, sort_order);
      revalidateTag("nav", { expire: 0 });
      return created({ item });
    },
  );
}
