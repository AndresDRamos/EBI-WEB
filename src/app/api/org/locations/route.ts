import { NextResponse, type NextRequest } from "next/server";
import { listLocations, createLocation } from "@/modules/org/db/locations";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

/** GET /api/org/locations — list plant locations (any authenticated user). */
export async function GET() {
  try {
    await requireUser();
    const locations = await listLocations();
    return NextResponse.json({ locations });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface CreateBody {
  plant_id?: unknown;
  code?: unknown;
  name?: unknown;
}

/** POST /api/org/locations — create a location within a plant. */
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await parseJsonBody(request)) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const plantId = Number(body.plant_id);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!Number.isInteger(plantId) || plantId <= 0 || !code || !name) {
    return NextResponse.json(
      { error: "Planta, código y nombre son obligatorios." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("org.location:create");
    const location = await createLocation({ plant_id: plantId, code, name });
    return NextResponse.json({ location }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: "El código ya existe en esa planta." },
        { status: 409 },
      );
    }
    console.error("POST /api/org/locations failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear la ubicación." },
      { status: 500 },
    );
  }
}
