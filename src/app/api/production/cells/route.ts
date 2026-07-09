import { NextResponse, type NextRequest } from "next/server";
import {
  createCell,
  listCells,
  CellCodeOverflowError,
  CellDepthExceededError,
  CellLocationInvalidError,
  CellParentInvalidError,
} from "@/modules/production/db";
import { findProcessById } from "@/modules/org/db/processes";
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
  name?: unknown;
  location_id?: unknown;
  parent_cell_id?: unknown;
  size_x_m?: unknown;
  size_y_m?: unknown;
  process_id?: unknown;
}

function parsePositiveNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/** POST /api/production/cells — create a production cell, pre-filtered by
 * location. The code is auto-generated server-side (never accepted here). */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const locationId = Number(body.location_id);
  if (!name || !Number.isInteger(locationId) || locationId <= 0) {
    return NextResponse.json(
      { error: "Nombre y ubicación son obligatorios." },
      { status: 422 },
    );
  }
  const parentId = body.parent_cell_id == null ? null : Number(body.parent_cell_id);
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
    return NextResponse.json({ error: "Celda padre inválida." }, { status: 422 });
  }
  const sizeX = parsePositiveNumber(body.size_x_m);
  const sizeY = parsePositiveNumber(body.size_y_m);
  if (Number.isNaN(sizeX) || Number.isNaN(sizeY)) {
    return NextResponse.json(
      { error: "El tamaño debe ser mayor a cero." },
      { status: 422 },
    );
  }
  if (sizeX === null || sizeY === null) {
    return NextResponse.json(
      { error: "El tamaño X y Y es obligatorio." },
      { status: 422 },
    );
  }
  const processId = body.process_id == null ? null : Number(body.process_id);
  if (processId !== null && (!Number.isInteger(processId) || processId <= 0)) {
    return NextResponse.json({ error: "Proceso inválido." }, { status: 422 });
  }
  try {
    await requirePermission("production.cell:create");
    if (processId !== null && !(await findProcessById(processId))) {
      return NextResponse.json({ error: "Proceso inválido." }, { status: 422 });
    }
    const cell = await createCell({
      name,
      location_id: locationId,
      parent_cell_id: parentId,
      size_x_m: sizeX,
      size_y_m: sizeY,
      process_id: processId,
    });
    return NextResponse.json({ cell }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    if (
      err instanceof CellLocationInvalidError ||
      err instanceof CellParentInvalidError ||
      err instanceof CellDepthExceededError
    ) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof CellCodeOverflowError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "";
    if (/UQ_cell_parent_sequence/i.test(msg)) {
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
