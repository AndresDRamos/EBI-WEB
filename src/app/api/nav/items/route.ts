import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createItem, findSectionById, listItems } from "@/modules/navigation/db";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";
import { NAV_ICON_NAMES } from "@/modules/navigation/icons";

/** GET /api/nav/items — list every sidebar item across sections (admin). */
export async function GET() {
  try {
    await requireAnyRole(["admin"]);
    const items = await listItems();
    return NextResponse.json({ items });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/nav/items failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar los ítems." }, { status: 500 });
  }
}

interface CreateBody {
  section_id?: unknown;
  parent_item_id?: unknown;
  label?: unknown;
  icon?: unknown;
  href?: unknown;
  sort_order?: unknown;
}

/**
 * POST /api/nav/items — create a sidebar item under an existing section
 * (admin). `href` must live under the section's `base_path` — that cross-row
 * rule can't be a DB CHECK, so it's enforced here.
 */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const sectionId = Number(body.section_id);
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const href = typeof body.href === "string" ? body.href.trim() : "";
  if (!Number.isInteger(sectionId) || sectionId <= 0 || !label || !href) {
    return NextResponse.json(
      { error: "Sección, etiqueta y ruta son obligatorias." },
      { status: 422 },
    );
  }
  if (body.icon !== undefined && body.icon !== null) {
    if (typeof body.icon !== "string" || !(NAV_ICON_NAMES as readonly string[]).includes(body.icon)) {
      return NextResponse.json({ error: "Ícono no reconocido." }, { status: 422 });
    }
  }
  const parentItemId =
    body.parent_item_id === null || body.parent_item_id === undefined
      ? null
      : Number(body.parent_item_id);
  if (parentItemId !== null && (!Number.isInteger(parentItemId) || parentItemId <= 0)) {
    return NextResponse.json({ error: "Ítem padre inválido." }, { status: 422 });
  }
  const sortOrder =
    typeof body.sort_order === "number" && Number.isInteger(body.sort_order)
      ? body.sort_order
      : 0;
  try {
    await requireAnyRole(["admin"]);
    const section = await findSectionById(sectionId);
    if (!section) {
      return NextResponse.json({ error: "Sección no encontrada." }, { status: 404 });
    }
    if (!href.startsWith(section.base_path)) {
      return NextResponse.json(
        { error: `La ruta debe empezar con '${section.base_path}'.` },
        { status: 422 },
      );
    }
    const item = await createItem({
      section_id: sectionId,
      parent_item_id: parentItemId,
      label,
      icon: (body.icon as string | undefined) ?? null,
      href,
      sort_order: sortOrder,
    });
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "Ya existe un ítem con esa ruta en la sección." }, { status: 409 });
    }
    console.error("POST /api/nav/items failed:", err);
    return NextResponse.json({ error: "No se pudo crear el ítem." }, { status: 500 });
  }
}
