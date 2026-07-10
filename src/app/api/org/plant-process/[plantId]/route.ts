import { NextResponse, type NextRequest } from "next/server";
import { setPlantProcesses } from "@/modules/org/db/plant-process";
import { findPlantById } from "@/modules/org/db/org";
import { plantProcessSchema } from "@/modules/org/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/**
 * PUT /api/org/plant-process/[plantId] — replace the set of processes assigned
 * to a plant. Body: `{ process_ids: number[] }`. Gated `org.plant_process:assign`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ plantId: string }> },
) {
  const plantId = parseId((await params).plantId);
  if (!plantId) return badRequest("ID de planta inválido.");
  const body = await parseBody(request, plantProcessSchema);
  if (body instanceof NextResponse) return body;
  const { process_ids } = body;

  return handleRoute(
    {
      guard: () => requirePermission("org.plant_process:assign"),
      fail: "No se pudieron guardar los procesos de la planta.",
      label: "PUT /api/org/plant-process/[plantId]",
    },
    async () => {
      if (!(await findPlantById(plantId))) return notFound("Planta no encontrada.");
      await setPlantProcesses(plantId, process_ids);
      return NextResponse.json({ ok: true });
    },
  );
}
