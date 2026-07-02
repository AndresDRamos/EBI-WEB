import { NextResponse, type NextRequest } from "next/server";
import { updateDepartment, deleteDepartment } from "@/modules/org/db/org";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

interface UpdateBody {
  name?: unknown;
  description?: unknown;
  is_active?: unknown;
}

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
  const changes: {
    name?: string;
    description?: string | null;
    is_active?: boolean;
  } = {};
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.description === null || (typeof body.description === "string" && body.description.trim())) {
    changes.description =
      typeof body.description === "string" ? body.description.trim() : null;
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requireAnyRole(["admin"]);
    await updateDepartment(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/departments/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar el departamento." }, { status: 500 });
  }
}

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
    await deleteDepartment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/departments/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar el departamento (¿tiene usuarios asignados?)." },
      { status: 409 },
    );
  }
}