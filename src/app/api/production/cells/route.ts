import { NextResponse, type NextRequest } from "next/server";
import { listCells, createCell, findLineById } from "@/modules/production/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/production/cells — list cells (any authenticated user). */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const activeOnly = request.nextUrl.searchParams.get("active") === "1";
    const cells = await listCells(activeOnly);
    return NextResponse.json({ cells });
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
  line_id?: unknown;
  sequence_in_line?: unknown;
}

/** POST /api/production/cells — create a production cell. */
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
  const lineId = body.line_id == null ? null : Number(body.line_id);
  if (lineId !== null && (!Number.isInteger(lineId) || lineId <= 0)) {
    return NextResponse.json({ error: "Línea inválida." }, { status: 422 });
  }
  const seq = body.sequence_in_line == null ? null : Number(body.sequence_in_line);
  if (seq !== null && (!Number.isInteger(seq) || seq <= 0)) {
    return NextResponse.json({ error: "Secuencia inválida." }, { status: 422 });
  }
  // Mirror of CK_cell_sequence_requires_line, as a friendly 422.
  if (seq !== null && lineId === null) {
    return NextResponse.json(
      { error: "La secuencia solo aplica cuando la celda pertenece a una línea." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("production.cell:create");
    if (lineId !== null && !(await findLineById(lineId))) {
      return NextResponse.json({ error: "Línea inválida." }, { status: 422 });
    }
    const cell = await createCell({
      code,
      name,
      plant_id: plantId,
      line_id: lineId,
      sequence_in_line: seq,
    });
    return NextResponse.json({ cell }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/UQ_cell_line_sequence/i.test(msg)) {
      return NextResponse.json(
        { error: "Ya existe una celda con esa secuencia en la línea." },
        { status: 409 },
      );
    }
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("POST /api/production/cells failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear la celda." },
      { status: 500 },
    );
  }
}
