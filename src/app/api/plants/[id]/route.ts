import { NextResponse, type NextRequest } from "next/server";
import { updatePlant, deletePlant } from "@/lib/db/org";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

interface UpdateBody {
  code?: unknown;
  name?: unknown;
  address?: unknown;
  postal_code?: unknown;
  is_active?: unknown;
}

/** PUT /api/plants/[id] — update a plant (admin). */
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
    address?: string | null;
    postal_code?: string | null;
    is_active?: boolean;
  } = {};
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.address === null || (typeof body.address === "string" && body.address.trim())) {
    changes.address =
      typeof body.address === "string" ? body.address.trim() : null;
  }
  if (
    body.postal_code === null ||
    (typeof body.postal_code === "string" && body.postal_code.trim())
  ) {
    changes.postal_code =
      typeof body.postal_code === "string" ? body.postal_code.trim() : null;
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requireAnyRole(["admin"]);
    await updatePlant(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("PUT /api/plants/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar la planta." }, { status: 500 });
  }
}

/** DELETE /api/plants/[id] — hard delete a plant (admin); 409 if referenced. */
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
    await deletePlant(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/plants/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar la planta (¿tiene usuarios asignados?)." },
      { status: 409 },
    );
  }
}