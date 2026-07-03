import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { deleteItem, findItemById, findSectionById, updateItem } from "@/modules/navigation/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";
import { NAV_ICON_NAMES } from "@/modules/navigation/icons";

interface UpdateBody {
  label?: unknown;
  icon?: unknown;
  href?: unknown;
  parent_item_id?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

/**
 * PUT /api/nav/items/[id] — update a sidebar item (admin). If `href` changes,
 * it's re-validated against the item's (unchangeable) section base_path.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  let body: UpdateBody;
  try {
    body = (await parseJsonBody(request)) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  try {
    await requirePermission("navigation.item:update");
    const current = await findItemById(id);
    if (!current) {
      return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
    }
    const changes: {
      label?: string;
      icon?: string | null;
      href?: string;
      parent_item_id?: number | null;
      sort_order?: number;
      is_active?: boolean;
    } = {};
    if (typeof body.label === "string" && body.label.trim()) changes.label = body.label.trim();
    if (body.icon === null) changes.icon = null;
    else if (typeof body.icon === "string") {
      if (!(NAV_ICON_NAMES as readonly string[]).includes(body.icon)) {
        return NextResponse.json({ error: "Ícono no reconocido." }, { status: 422 });
      }
      changes.icon = body.icon;
    }
    if (typeof body.href === "string" && body.href.trim()) {
      const href = body.href.trim();
      const section = await findSectionById(current.section_id);
      if (section && !href.startsWith(section.base_path)) {
        return NextResponse.json(
          { error: `La ruta debe empezar con '${section.base_path}'.` },
          { status: 422 },
        );
      }
      changes.href = href;
    }
    if (body.parent_item_id === null) changes.parent_item_id = null;
    else if (typeof body.parent_item_id === "number") changes.parent_item_id = body.parent_item_id;
    if (typeof body.sort_order === "number" && Number.isInteger(body.sort_order)) {
      changes.sort_order = body.sort_order;
    }
    if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
    }
    await updateItem(id, changes);
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "Ya existe un ítem con esa ruta en la sección." }, { status: 409 });
    }
    console.error("PUT /api/nav/items/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar el ítem." }, { status: 500 });
  }
}

/** DELETE /api/nav/items/[id] — hard delete. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requirePermission("navigation.item:delete");
    const current = await findItemById(id);
    if (!current) {
      return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
    }
    await deleteItem(id);
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/nav/items/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar el ítem." }, { status: 500 });
  }
}
