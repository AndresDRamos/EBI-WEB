import { NextResponse, type NextRequest } from "next/server";
import {
  getReport,
  setActive,
  updateReport,
  deleteReport,
  type ReportInput,
} from "@/lib/db/reports";
import { requireUser, requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

interface UpdateReportBody {
  name?: unknown;
  workspace_guid?: unknown;
  report_guid?: unknown;
  dataset_guid?: unknown;
  category_id?: unknown;
  description?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requireUser();
    const report = await getReport(id);
    if (!report) {
      return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
     
    console.error("GET /api/reports/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo obtener el reporte." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requireAnyRole(["admin"]);
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
  let body: UpdateReportBody;
  try {
    body = (await request.json()) as UpdateReportBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const changes: Partial<ReportInput> = {};
  if (typeof body.name === "string" && body.name.trim())
    changes.name = body.name.trim();
  if (typeof body.workspace_guid === "string" && body.workspace_guid.trim())
    changes.workspace_guid = body.workspace_guid.trim();
  if (typeof body.report_guid === "string" && body.report_guid.trim())
    changes.report_guid = body.report_guid.trim();
  if (typeof body.dataset_guid === "string")
    changes.dataset_guid = body.dataset_guid.trim() || null;
  if (body.category_id === null) {
    changes.category_id = null;
  } else if (body.category_id !== undefined) {
    const n = Number(body.category_id);
    if (Number.isInteger(n)) changes.category_id = n;
  }
  if (typeof body.description === "string")
    changes.description = body.description.trim() || null;
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (Number.isInteger(n)) changes.sort_order = n;
  }
  if (typeof body.is_active === "boolean") {
    changes.is_active = body.is_active;
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }

  try {
    await updateReport(id, changes);
    const report = await getReport(id);
    return NextResponse.json({ report });
  } catch (err) {
     
    console.error("PUT /api/reports/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el reporte." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requireAnyRole(["admin"]);
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
  let body: { active?: unknown };
  try {
    body = (await request.json()) as { active?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (typeof body.active !== "boolean") {
    return NextResponse.json(
      { error: "Se requiere 'active' booleano." },
      { status: 422 },
    );
  }
  try {
    await setActive(id, body.active);
    return NextResponse.json({ ok: true });
  } catch (err) {
     
    console.error("PATCH /api/reports/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el estado." },
      { status: 500 },
    );
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
    await deleteReport(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
     
    console.error("DELETE /api/reports/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar el reporte." },
      { status: 500 },
    );
  }
}