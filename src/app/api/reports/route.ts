import { NextResponse, type NextRequest } from "next/server";
import {
  adminListReports,
  createReport,
  listCategories,
  listActiveReports,
} from "@/modules/reports/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

interface CreateReportBody {
  name?: unknown;
  workspace_guid?: unknown;
  report_guid?: unknown;
  dataset_guid?: unknown;
  category_id?: unknown;
  description?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

/** GET /api/reports — admin list (all reports) or active-only (?active=1). */
export async function GET(request: NextRequest) {
  const activeOnly = request.nextUrl.searchParams.get("active") === "1";
  try {
    await requireUser();
    if (activeOnly) {
      const reports = await listActiveReports();
      return NextResponse.json({ reports });
    }
    const [reports, categories] = await Promise.all([
      adminListReports(),
      listCategories(),
    ]);
    return NextResponse.json({ reports, categories });
  } catch (err) {
     
    console.error("GET /api/reports failed:", err);
    return NextResponse.json(
      { error: "No se pudieron obtener los reportes." },
      { status: 500 },
    );
  }
}

/** POST /api/reports — create a report. */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("reports.report:create");
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
  let body: CreateReportBody;
  try {
    body = (await request.json()) as CreateReportBody;
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de la solicitud inválido." },
      { status: 400 },
    );
  }

  const validation = validateReport(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  try {
    const created = await createReport({
      name: validation.value.name,
      workspace_guid: validation.value.workspace_guid,
      report_guid: validation.value.report_guid,
      dataset_guid: validation.value.dataset_guid,
      category_id: validation.value.category_id,
      description: validation.value.description,
      sort_order: validation.value.sort_order,
      is_active: validation.value.is_active,
    });
    return NextResponse.json({ report: created }, { status: 201 });
  } catch (err) {
     
    console.error("POST /api/reports failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear el reporte." },
      { status: 500 },
    );
  }
}

interface ReportValidation {
  ok: true;
  value: {
    name: string;
    workspace_guid: string;
    report_guid: string;
    dataset_guid: string | null;
    category_id: number | null;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  };
}
interface ReportValidationFail {
  ok: false;
  error: string;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function asInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function validateReport(body: CreateReportBody): ReportValidation | ReportValidationFail {
  const name = asString(body.name);
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  const workspace_guid = asString(body.workspace_guid);
  if (!workspace_guid)
    return { ok: false, error: "El GUID de workspace es obligatorio." };

  const report_guid = asString(body.report_guid);
  if (!report_guid)
    return { ok: false, error: "El GUID de reporte es obligatorio." };

  const dataset_guid = asString(body.dataset_guid);
  const category_id = body.category_id === null ? null : asInt(body.category_id);
  const description = asString(body.description);
  const sort_order = asInt(body.sort_order) ?? 0;
  const is_active = body.is_active === false ? false : body.is_active !== false;

  return {
    ok: true,
    value: {
      name,
      workspace_guid,
      report_guid,
      dataset_guid,
      category_id,
      description,
      sort_order,
      is_active,
    },
  };
}