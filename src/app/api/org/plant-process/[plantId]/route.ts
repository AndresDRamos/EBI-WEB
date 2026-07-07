import { NextResponse, type NextRequest } from "next/server";
import { setPlantProcesses } from "@/modules/org/db/plant-process";
import { findPlantById } from "@/modules/org/db/org";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

interface Body {
  process_ids?: unknown;
}

/**
 * PUT /api/org/plant-process/[plantId] — replace the set of processes assigned
 * to a plant. Body: `{ process_ids: number[] }`. Gated `org.plant_process:assign`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ plantId: string }> },
) {
  const plantId = Number((await params).plantId);
  if (!Number.isInteger(plantId) || plantId <= 0) {
    return NextResponse.json({ error: "ID de planta inválido." }, { status: 400 });
  }
  let body: Body;
  try {
    body = (await parseJsonBody(request)) as Body;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const processIds = Array.isArray(body.process_ids)
    ? body.process_ids.filter(
        (v): v is number => Number.isInteger(v) && (v as number) > 0,
      )
    : null;
  if (processIds === null) {
    return NextResponse.json(
      { error: "process_ids debe ser un arreglo de enteros." },
      { status: 422 },
    );
  }
  try {
    await requirePermission("org.plant_process:assign");
    if (!(await findPlantById(plantId))) {
      return NextResponse.json({ error: "Planta no encontrada." }, { status: 404 });
    }
    await setPlantProcesses(plantId, processIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/org/plant-process/[plantId] failed:", err);
    return NextResponse.json(
      { error: "No se pudieron guardar los procesos de la planta." },
      { status: 500 },
    );
  }
}
