import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findSectionById, updateSection, deleteSection } from "@/modules/navigation/db";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";
import { NAV_ICON_NAMES } from "@/modules/navigation/icons";

interface UpdateBody {
  label?: unknown;
  icon?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

/**
 * PUT /api/nav/sections/[id] — update label / icon / sort_order / is_active
 * (admin). `base_path` and `code` are not accepted: routes are owned by code,
 * not the admin panel.
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
    await requireAnyRole(["admin"]);
    const current = await findSectionById(id);
    if (!current) {
      return NextResponse.json({ error: "Sección no encontrada." }, { status: 404 });
    }
    const changes: {
      label?: string;
      icon?: string | null;
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
    if (typeof body.sort_order === "number" && Number.isInteger(body.sort_order)) {
      changes.sort_order = body.sort_order;
    }
    if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
    }
    await updateSection(id, changes);
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/nav/sections/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar la sección." }, { status: 500 });
  }
}

/** DELETE /api/nav/sections/[id] — hard delete; cascades items + grants (V7). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requireAnyRole(["admin"]);
    const current = await findSectionById(id);
    if (!current) {
      return NextResponse.json({ error: "Sección no encontrada." }, { status: 404 });
    }
    await deleteSection(id);
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/nav/sections/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la sección." }, { status: 500 });
  }
}
