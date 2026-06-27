import { NextResponse, type NextRequest } from "next/server";
import { listPlants, createPlant } from "@/lib/db/org";
import { requireUser, requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/plants — list plants (any authenticated user). */
export async function GET() {
  try {
    await requireUser();
    const plants = await listPlants();
    return NextResponse.json({ plants });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  code?: unknown;
  name?: unknown;
  address?: unknown;
  postal_code?: unknown;
}

/** POST /api/plants — create a plant (admin). */
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
    return NextResponse.json({ error: "Código y nombre son obligatorios." }, { status: 422 });
  }
  const address =
    typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;
  const postal_code =
    typeof body.postal_code === "string" && body.postal_code.trim()
      ? body.postal_code.trim()
      : null;
  try {
    await requireAnyRole(["admin"]);
    const plant = await createPlant({ code, name, address, postal_code });
    return NextResponse.json({ plant }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("POST /api/plants failed:", err);
    return NextResponse.json({ error: "No se pudo crear la planta." }, { status: 500 });
  }
}