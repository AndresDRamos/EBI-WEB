import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findRoleById, PROTECTED_ROLE } from "@/modules/org/db/org";
import {
  listRoleSectionGrants,
  setRoleSectionGrants,
} from "@/modules/navigation/db";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/roles/[id]/sections — nav sections granted to a role (admin). */
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
    const grants = await listRoleSectionGrants(id);
    return NextResponse.json({ grants });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/roles/[id]/sections failed:", err);
    return NextResponse.json(
      { error: "No se pudieron cargar los accesos del rol." },
      { status: 500 },
    );
  }
}

interface GrantInput {
  section_id?: unknown;
  priority?: unknown;
}
interface PutBody {
  grants?: unknown;
}

/**
 * PUT /api/roles/[id]/sections — replace the role's full section grant set
 * (role-centric dual of PUT /api/nav/sections/[id]/grants; same permission
 * gate). The protected `admin` role is rejected: it sees every section at the
 * app layer and must never hold grant rows.
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
    return NextResponse.json({ error: "Formato de accesos inválido." }, { status: 400 });
  }
  const grants: { section_id: number; priority: number }[] = [];
  for (const raw of body.grants as GrantInput[]) {
    const section_id = Number(raw.section_id);
    const priority = Number(raw.priority);
    if (!Number.isInteger(section_id) || section_id <= 0 || !Number.isInteger(priority)) {
      return NextResponse.json({ error: "Formato de accesos inválido." }, { status: 400 });
    }
    grants.push({ section_id, priority });
  }
  try {
    await requirePermission("navigation.grants:update");
    const current = await findRoleById(id);
    if (!current) {
      return NextResponse.json({ error: "Rol no encontrado." }, { status: 404 });
    }
    if (current.name === PROTECTED_ROLE) {
      return NextResponse.json(
        { error: `El rol '${PROTECTED_ROLE}' no usa accesos: siempre ve todas las secciones.` },
        { status: 409 },
      );
    }
    await setRoleSectionGrants(id, grants);
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/roles/[id]/sections failed:", err);
    return NextResponse.json(
      { error: "No se pudieron guardar los accesos." },
      { status: 500 },
    );
  }
}
