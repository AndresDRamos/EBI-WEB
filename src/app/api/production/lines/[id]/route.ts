import { NextResponse, type NextRequest } from "next/server";
import { findLineById, updateLine } from "@/modules/production/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/production/lines/[id] — single line (any authenticated user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const line = await findLineById(id);
    if (!line) {
      return NextResponse.json({ error: "Línea no encontrada." }, { status: 404 });
    }
    return NextResponse.json({ line });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface PatchBody {
  code?: unknown;
  name?: unknown;
  plant_id?: unknown;
  is_active?: unknown;
}

/** PATCH /api/production/lines/[id] — update a production line. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: PatchBody;
  try {
    body = (await parseJsonBody(request)) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const changes: Parameters<typeof updateLine>[1] = {};
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.plant_id !== undefined) {
    const plantId = Number(body.plant_id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return NextResponse.json({ error: "Planta inválida." }, { status: 422 });
    }
    changes.plant_id = plantId;
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requirePermission("production.line:update");
    if (!(await findLineById(id))) {
      return NextResponse.json({ error: "Línea no encontrada." }, { status: 404 });
    }
    await updateLine(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("PATCH /api/production/lines/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la línea." },
      { status: 500 },
    );
  }
}
