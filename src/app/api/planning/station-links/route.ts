import { NextResponse, type NextRequest } from "next/server";
import {
  listStationMappings,
  linkStationToCell,
  CellAlreadyLinkedError,
  StationAlreadyLinkedError,
  CellNotAssignableError,
  LinkNotFoundError,
} from "@/modules/planning/db";
import { linkStationSchema } from "@/modules/planning/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { conflict, created, handleRoute, parseBody, unprocessable } from "@/lib/api/handler";

/** GET /api/planning/station-links — both sides of the EPS station ↔ EBI cell
 * mapping + assignable CL cells (Admin → Migraciones). Any authenticated user
 * (the page itself is admin-gated). */
export async function GET() {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar los mapeos.", label: "GET /api/planning/station-links" },
    async () => NextResponse.json(await listStationMappings()),
  );
}

/** POST /api/planning/station-links — link a CL cell to an EPS station. */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, linkStationSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("planning.station_link:manage"),
      uniqueFallback: "La celda o la estación ya están enlazadas.",
      fail: "No se pudo crear el enlace.",
      label: "POST /api/planning/station-links",
    },
    async () => {
      try {
        const linkId = await linkStationToCell({
          cell_id: body.cell_id,
          eps_station_id: body.eps_station_id,
        });
        return created({ cell_station_link_id: linkId });
      } catch (err) {
        if (err instanceof CellNotAssignableError || err instanceof LinkNotFoundError) {
          return unprocessable(err.message);
        }
        if (err instanceof CellAlreadyLinkedError || err instanceof StationAlreadyLinkedError) {
          return conflict(err.message);
        }
        throw err;
      }
    },
  );
}
