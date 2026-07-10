import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findRoleById, PROTECTED_ROLE } from "@/modules/org/db/org";
import { listRoleItemGrants, setRoleItemGrants } from "@/modules/navigation/db";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/**
 * GET /api/roles/[id]/items — pages (nav items) visible to a role, with their
 * per-role order (`role_nav_item`, ADR 0008). Admin-only read.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requireAnyRole(["admin"]);
    const grants = await listRoleItemGrants(id);
    return NextResponse.json({ grants });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/roles/[id]/items failed:", err);
    return NextResponse.json(
      { error: "No se pudo cargar la visibilidad de páginas del rol." },
      { status: 500 },
    );
  }
}

interface GrantInput {
  item_id?: unknown;
  priority?: unknown;
}
interface PutBody {
  grants?: unknown;
}

/**
 * PUT /api/roles/[id]/items — replace the role's full page-visibility set (and
 * per-role page order). Same gate as section grants (`navigation.grants:update`,
 * now page-granular). The protected `admin` role is rejected: it sees every
 * page at the app layer and must never hold grant rows.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  let body: PutBody;
  try {
    body = (await parseJsonBody(request)) as PutBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (!Array.isArray(body.grants)) {
    return NextResponse.json({ error: "Formato de visibilidad inválido." }, { status: 400 });
  }
  const grants: { item_id: number; priority: number }[] = [];
  for (const raw of body.grants as GrantInput[]) {
    const item_id = Number(raw.item_id);
    const priority = Number(raw.priority);
    if (!Number.isInteger(item_id) || item_id <= 0 || !Number.isInteger(priority)) {
      return NextResponse.json({ error: "Formato de visibilidad inválido." }, { status: 400 });
    }
    grants.push({ item_id, priority });
  }
  try {
    await requirePermission("navigation.grants:update");
    const current = await findRoleById(id);
    if (!current) {
      return NextResponse.json({ error: "Rol no encontrado." }, { status: 404 });
    }
    if (current.name === PROTECTED_ROLE) {
      return NextResponse.json(
        { error: `El rol '${PROTECTED_ROLE}' no usa visibilidad: siempre ve todas las páginas.` },
        { status: 409 },
      );
    }
    await setRoleItemGrants(id, grants);
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/roles/[id]/items failed:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la visibilidad de páginas." },
      { status: 500 },
    );
  }
}
