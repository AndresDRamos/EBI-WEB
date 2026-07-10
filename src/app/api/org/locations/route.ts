import { NextResponse, type NextRequest } from "next/server";
import { listLocations, createLocation } from "@/modules/org/db/locations";
import { createLocationSchema } from "@/modules/org/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/org/locations — list plant locations (any authenticated user). */
export async function GET() {
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo cargar la lista de ubicaciones.",
      label: "GET /api/org/locations",
    },
    async () => {
      const locations = await listLocations();
      return NextResponse.json({ locations });
    },
  );
}

/** POST /api/org/locations — create a location within a plant. */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createLocationSchema);
  if (body instanceof NextResponse) return body;
  const { plant_id, code, name } = body;

  return handleRoute(
    {
      guard: () => requirePermission("org.location:create"),
      uniqueFallback: "El código ya existe en esa planta.",
      fail: "No se pudo crear la ubicación.",
      label: "POST /api/org/locations",
    },
    async () => {
      const location = await createLocation({ plant_id, code, name });
      return created({ location });
    },
  );
}
