import { NextResponse, type NextRequest } from "next/server";
import { listLines, createLine } from "@/modules/production/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/production/lines — list lines (any authenticated user). */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const activeOnly = request.nextUrl.searchParams.get("active") === "1";
    const lines = await listLines(activeOnly);
    return NextResponse.json({ lines });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  code?: unknown;
  name?: unknown;
  plant_id?: unknown;
}

/** POST /api/production/lines — create a production line. */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const plantId = Number(body.plant_id);
  if (!code || !name || !Number.isInteger(plantId) || plantId <= 0) {
    return NextResponse.json(
      { error: "Código, nombre y planta son obligatorios." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("production.line:create");
    const line = await createLine({ code, name, plant_id: plantId });
    return NextResponse.json({ line }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("POST /api/production/lines failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear la línea." },
      { status: 500 },
    );
  }
}
