import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findSectionById, listSectionGrants, setSectionGrants } from "@/lib/db/nav";
import { requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/nav/sections/[id]/grants — current role grants for a section (admin). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requireAnyRole(["admin"]);
    const grants = await listSectionGrants(id);
    return NextResponse.json({ grants });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/nav/sections/[id]/grants failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar los accesos." }, { status: 500 });
  }
}

interface GrantInput {
  role_id?: unknown;
  priority?: unknown;
}
interface PutBody {
  grants?: unknown;
}

/**
 * PUT /api/nav/sections/[id]/grants — replace the full grant set for a
 * section (admin). Body: `{ grants: [{ role_id, priority }] }`. The `admin`
 * role never needs a row (app-layer sees-all rule) — grants targeting it are
 * silently dropped so the table stays a pure non-admin visibility config.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  let body: PutBody;
  try {
    body = (await parseJsonBody(request)) as PutBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (!Array.isArray(body.grants)) {
    return NextResponse.json({ error: "Formato de accesos inválido." }, { status: 400 });
  }
  const grants: { role_id: number; priority: number }[] = [];
  for (const raw of body.grants as GrantInput[]) {
    const role_id = Number(raw.role_id);
    const priority = Number(raw.priority);
    if (!Number.isInteger(role_id) || role_id <= 0 || !Number.isInteger(priority)) {
      return NextResponse.json({ error: "Formato de accesos inválido." }, { status: 400 });
    }
    grants.push({ role_id, priority });
  }
  try {
    await requireAnyRole(["admin"]);
    const current = await findSectionById(id);
    if (!current) {
      return NextResponse.json({ error: "Sección no encontrada." }, { status: 404 });
    }
    await setSectionGrants(id, grants);
    revalidateTag("nav", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/nav/sections/[id]/grants failed:", err);
    return NextResponse.json({ error: "No se pudieron guardar los accesos." }, { status: 500 });
  }
}
