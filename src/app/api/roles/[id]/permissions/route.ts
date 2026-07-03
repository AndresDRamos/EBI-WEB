import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findRoleById, PROTECTED_ROLE } from "@/modules/org/db/org";
import {
  listRolePermissionIds,
  setRolePermissions,
} from "@/modules/org/db/permissions";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/roles/[id]/permissions — permission ids granted to a profile (admin). */
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
    const permission_ids = await listRolePermissionIds(id);
    return NextResponse.json({ permission_ids });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/roles/[id]/permissions failed:", err);
    return NextResponse.json(
      { error: "No se pudieron cargar los permisos del perfil." },
      { status: 500 },
    );
  }
}

interface PutBody {
  permission_ids?: unknown;
}

/**
 * PUT /api/roles/[id]/permissions — replace the profile's full permission
 * grant set. Gated by `org.role:update` (managing grants is editing the
 * profile — no meta-permission). The protected `admin` profile is rejected:
 * it bypasses at the app layer and must never hold grant rows.
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
  if (!Array.isArray(body.permission_ids)) {
    return NextResponse.json({ error: "Formato de permisos inválido." }, { status: 400 });
  }
  const permissionIds: number[] = [];
  for (const raw of body.permission_ids) {
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) {
      return NextResponse.json({ error: "Formato de permisos inválido." }, { status: 400 });
    }
    permissionIds.push(pid);
  }
  try {
    await requirePermission("org.role:update");
    const current = await findRoleById(id);
    if (!current) {
      return NextResponse.json({ error: "Perfil no encontrado." }, { status: 404 });
    }
    if (current.name === PROTECTED_ROLE) {
      return NextResponse.json(
        { error: `El rol '${PROTECTED_ROLE}' no usa permisos: siempre tiene acceso total.` },
        { status: 409 },
      );
    }
    await setRolePermissions(id, permissionIds);
    revalidateTag("permissions", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/roles/[id]/permissions failed:", err);
    return NextResponse.json(
      { error: "No se pudieron guardar los permisos." },
      { status: 500 },
    );
  }
}
