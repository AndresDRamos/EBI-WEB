import { NextResponse, type NextRequest } from "next/server";
import {
  findRoleById,
  updateRole,
  deleteRole,
  RoleProtectedError,
  PROTECTED_ROLE,
} from "@/lib/db/org";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

interface UpdateBody {
  name?: unknown;
  description?: unknown;
  is_active?: unknown;
}

/**
 * PUT /api/roles/[id] — update a role (admin). The `admin` role is protected
 * at the app layer from rename / deactivate; viewer and other roles are normal
 * CRUD. Soft-delete = set `is_active=false` via this verb; hard-delete = DELETE.
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
    const current = await findRoleById(id);
    if (!current) {
      return NextResponse.json({ error: "Rol no encontrado." }, { status: 404 });
    }
    const changes: {
      name?: string;
      description?: string | null;
      is_active?: boolean;
    } = {};
    if (typeof body.name === "string" && body.name.trim()) {
      changes.name = body.name.trim();
    }
    if (
      body.description === null ||
      (typeof body.description === "string" && body.description.trim())
    ) {
      changes.description =
        typeof body.description === "string" ? body.description.trim() : null;
    }
    if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
    }
    await updateRole(id, changes, current);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    if (err instanceof RoleProtectedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El rol ya existe." }, { status: 409 });
    }
    console.error("PUT /api/roles/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar el rol." }, { status: 500 });
  }
}

/**
 * DELETE /api/roles/[id] — hard delete. The `admin` role is rejected upfront;
 * other roles 409 when referenced by users (FK blocks). To deactivate, use
 * PUT with `is_active=false` — that also blocks for `admin`.
 */
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
    const current = await findRoleById(id);
    if (!current) {
      return NextResponse.json({ error: "Rol no encontrado." }, { status: 404 });
    }
    if (current.name === PROTECTED_ROLE) {
      return NextResponse.json(
        { error: `El rol '${PROTECTED_ROLE}' no se puede eliminar.` },
        { status: 409 },
      );
    }
    await deleteRole(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/roles/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar el rol (¿tiene usuarios asignados?)." },
      { status: 409 },
    );
  }
}