import { NextResponse, type NextRequest } from "next/server";
import { listProcesses, createProcess } from "@/modules/maintenance/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/maintenance/processes — list manufacturing processes (any authenticated user). */
export async function GET() {
  try {
    await requireUser();
    const processes = await listProcesses();
    return NextResponse.json({ processes });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  code?: unknown;
  name?: unknown;
  description?: unknown;
}

/** POST /api/maintenance/processes — create a process (admin). */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!code || !name) {
    return NextResponse.json(
      { error: "Código y nombre son obligatorios." },
      { status: 422 },
    );
  }
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  try {
    await requirePermission("maintenance.process:create");
    const process = await createProcess({ code, name, description });
    return NextResponse.json({ process }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("POST /api/maintenance/processes failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear el proceso." },
      { status: 500 },
    );
  }
}
