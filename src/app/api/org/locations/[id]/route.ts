import { NextResponse, type NextRequest } from "next/server";
import { updateLocation, deleteLocation } from "@/modules/org/db/locations";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

interface UpdateBody {
  code?: unknown;
  name?: unknown;
  is_active?: unknown;
}

/** PUT /api/org/locations/[id] — update a location. */
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
  const changes: { code?: string; name?: string; is_active?: boolean } = {};
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requirePermission("org.location:update");
    await updateLocation(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: "El código ya existe en esa planta." },
        { status: 409 },
      );
    }
    console.error("PUT /api/org/locations/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la ubicación." },
      { status: 500 },
    );
  }
}

/** DELETE /api/org/locations/[id] — hard delete; 409 if referenced. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requirePermission("org.location:delete");
    await deleteLocation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/org/locations/[id] failed:", err);
    return NextResponse.json(
      {
        error:
          "No se pudo eliminar la ubicación (¿tiene equipos o celdas asignados?).",
      },
      { status: 409 },
    );
  }
}
