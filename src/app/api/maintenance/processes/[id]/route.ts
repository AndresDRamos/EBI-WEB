import { NextResponse, type NextRequest } from "next/server";
import {
  findProcessById,
  updateProcess,
  deleteProcess,
} from "@/modules/maintenance/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

interface UpdateBody {
  code?: unknown;
  name?: unknown;
  description?: unknown;
  is_active?: unknown;
}

/** PUT /api/maintenance/processes/[id] — update a process (admin). */
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
    code?: string;
    name?: string;
    description?: string | null;
    is_active?: boolean;
  } = {};
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
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
  try {
    await requirePermission("maintenance.process:update");
    if (!(await findProcessById(id))) {
      return NextResponse.json({ error: "Proceso no encontrado." }, { status: 404 });
    }
    await updateProcess(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("PUT /api/maintenance/processes/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el proceso." },
      { status: 500 },
    );
  }
}

/** DELETE /api/maintenance/processes/[id] — hard delete (admin); 409 if assets link it. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requirePermission("maintenance.process:delete");
    if (!(await findProcessById(id))) {
      return NextResponse.json({ error: "Proceso no encontrado." }, { status: 404 });
    }
    await deleteProcess(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/maintenance/processes/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar el proceso (¿tiene equipos vinculados?)." },
      { status: 409 },
    );
  }
}
