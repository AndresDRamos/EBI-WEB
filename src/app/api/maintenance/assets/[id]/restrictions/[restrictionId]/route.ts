import { NextResponse, type NextRequest } from "next/server";
import {
  updateRestriction,
  softDeleteRestriction,
  RESTRICTION_TYPES,
} from "@/modules/maintenance/db";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface UpdateBody {
  restriction_type?: unknown;
  description?: unknown;
  is_active?: unknown;
}

/** PUT /api/maintenance/assets/[id]/restrictions/[restrictionId] — update (admin). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; restrictionId: string }> },
) {
  const restrictionId = parseId((await params).restrictionId);
  if (!restrictionId) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  let body: UpdateBody;
  try {
    body = (await parseJsonBody(request)) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const changes: {
    restriction_type?: string;
    description?: string;
    is_active?: boolean;
  } = {};
  if (body.restriction_type !== undefined) {
    if (
      typeof body.restriction_type !== "string" ||
      !(RESTRICTION_TYPES as readonly string[]).includes(body.restriction_type)
    ) {
      return NextResponse.json(
        { error: "Tipo de restricción inválido." },
        { status: 422 },
      );
    }
    changes.restriction_type = body.restriction_type;
  }
  if (typeof body.description === "string" && body.description.trim()) {
    changes.description = body.description.trim();
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requirePermission("maintenance.restriction:update");
    await updateRestriction(restrictionId, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/maintenance/assets/[id]/restrictions/[restrictionId] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la restricción." },
      { status: 500 },
    );
  }
}

/** DELETE /api/maintenance/assets/[id]/restrictions/[restrictionId] — soft delete (admin). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; restrictionId: string }> },
) {
  const restrictionId = parseId((await params).restrictionId);
  if (!restrictionId) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requirePermission("maintenance.restriction:delete");
    await softDeleteRestriction(restrictionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/maintenance/assets/[id]/restrictions/[restrictionId] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar la restricción." },
      { status: 500 },
    );
  }
}
