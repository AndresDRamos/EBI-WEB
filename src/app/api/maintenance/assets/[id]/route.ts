import { NextResponse, type NextRequest } from "next/server";
import {
  getAssetDetail,
  updateAsset,
  softDeleteAsset,
  setAssetProcesses,
  ASSET_STATUSES,
  ASSET_CRITICALITIES,
} from "@/modules/maintenance/db";
import { requireUser, requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/maintenance/assets/[id] — full detail (any authenticated user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const detail = await getAssetDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface PatchBody {
  code?: unknown;
  name?: unknown;
  plant_id?: unknown;
  brand?: unknown;
  model?: unknown;
  serial_number?: unknown;
  location?: unknown;
  criticality?: unknown;
  status?: unknown;
  parent_asset_id?: unknown;
  acquisition_date?: unknown;
  notes?: unknown;
  is_active?: unknown;
  /** Full replacement of the asset ↔ process M:N when present. */
  process_ids?: unknown;
}

/** PATCH /api/maintenance/assets/[id] — update fields and/or replace processes (admin). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  let body: PatchBody;
  try {
    body = (await parseJsonBody(request)) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const changes: Parameters<typeof updateAsset>[1] = {};
  if (typeof body.code === "string" && body.code.trim()) changes.code = body.code.trim();
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.plant_id !== undefined) {
    const plantId = Number(body.plant_id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return NextResponse.json({ error: "Planta inválida." }, { status: 422 });
    }
    changes.plant_id = plantId;
  }
  for (const key of ["brand", "model", "serial_number", "location", "notes"] as const) {
    const v = body[key];
    if (v === null || typeof v === "string") {
      changes[key] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
  }
  if (body.criticality !== undefined) {
    if (
      typeof body.criticality !== "string" ||
      !(ASSET_CRITICALITIES as readonly string[]).includes(body.criticality)
    ) {
      return NextResponse.json({ error: "Criticidad inválida." }, { status: 422 });
    }
    changes.criticality = body.criticality;
  }
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !(ASSET_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json({ error: "Estatus inválido." }, { status: 422 });
    }
    changes.status = body.status;
  }
  if (body.parent_asset_id !== undefined) {
    const parentId = body.parent_asset_id == null ? null : Number(body.parent_asset_id);
    if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0 || parentId === id)) {
      return NextResponse.json({ error: "Equipo padre inválido." }, { status: 422 });
    }
    changes.parent_asset_id = parentId;
  }
  if (body.acquisition_date !== undefined) {
    if (body.acquisition_date == null || body.acquisition_date === "") {
      changes.acquisition_date = null;
    } else if (typeof body.acquisition_date === "string") {
      const d = new Date(body.acquisition_date);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Fecha de adquisición inválida." },
          { status: 422 },
        );
      }
      changes.acquisition_date = d;
    } else {
      return NextResponse.json(
        { error: "Fecha de adquisición inválida." },
        { status: 422 },
      );
    }
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;

  let processIds: number[] | undefined;
  if (body.process_ids !== undefined) {
    if (
      !Array.isArray(body.process_ids) ||
      body.process_ids.some((p) => !Number.isInteger(p) || (p as number) <= 0)
    ) {
      return NextResponse.json({ error: "Procesos inválidos." }, { status: 422 });
    }
    processIds = body.process_ids as number[];
  }

  if (Object.keys(changes).length === 0 && processIds === undefined) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requireAnyRole(["admin"]);
    if (Object.keys(changes).length > 0) await updateAsset(id, changes);
    if (processIds !== undefined) await setAssetProcesses(id, processIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) {
      return NextResponse.json({ error: "El código ya existe." }, { status: 409 });
    }
    console.error("PATCH /api/maintenance/assets/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el equipo." },
      { status: 500 },
    );
  }
}

/** DELETE /api/maintenance/assets/[id] — soft delete (admin). Assets are history-bearing. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireAnyRole(["admin"]);
    await softDeleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/maintenance/assets/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo desactivar el equipo." },
      { status: 500 },
    );
  }
}
