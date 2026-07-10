import { NextResponse, type NextRequest } from "next/server";
import { listPlants, createPlant } from "@/modules/org/db/org";
import { createPlantSchema } from "@/modules/org/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/plants — list plants (any authenticated user). */
export async function GET() {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la lista de plantas.", label: "GET /api/plants" },
    async () => {
      const plants = await listPlants();
      return NextResponse.json({ plants });
    },
  );
}

/** POST /api/plants — create a plant (admin). */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createPlantSchema);
  if (body instanceof NextResponse) return body;
  const { code, name, address, postal_code } = body;

  return handleRoute(
    {
      guard: () => requirePermission("org.plant:create"),
      uniqueFallback: "El código ya existe.",
      fail: "No se pudo crear la planta.",
      label: "POST /api/plants",
    },
    async () => {
      const plant = await createPlant({ code, name, address, postal_code });
      return created({ plant });
    },
  );
}
