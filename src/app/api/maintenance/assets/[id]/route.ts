import { NextResponse, type NextRequest } from "next/server";
import {
  getAssetDetail,
  findAssetById,
  updateAsset,
  softDeleteAsset,
} from "@/modules/maintenance/db";
import { findLocationById } from "@/modules/org/db/locations";
import { listHistoryByAsset } from "@/modules/production/db";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/maintenance/assets/[id] — full detail incl. production cell
 * assignment history (any authenticated user) — backs the equipment modal's
 * tabs (Documentación/Restricciones) and the Celda field. */
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
    const assignments = await listHistoryByAsset(id).catch(() => []);
    return NextResponse.json({ ...detail, assignments });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface PatchBody {
  name?: unknown;
  location_id?: unknown;
  asset_type_id?: unknown;
  brand?: unknown;
  model?: unknown;
  serial_number?: unknown;
  parent_asset_id?: unknown;
  installation_date?: unknown;
  image_blob_path?: unknown;
  notes?: unknown;
  is_active?: unknown;
}

/** PATCH /api/maintenance/assets/[id] — update fields. `code`, `status` and
 * `plant_id` are not accepted: the matrícula is immutable, status is not
 * user-settable, and the plant derives from the location (V18). Moving the
 * asset to another location closes its current cell assignments (they no
 * longer share the location — historized close, never a delete). */
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
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim();
  if (body.location_id !== undefined) {
    const locationId = Number(body.location_id);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return NextResponse.json({ error: "Ubicación inválida." }, { status: 422 });
    }
    changes.location_id = locationId;
  }
  if (body.asset_type_id !== undefined) {
    const typeId = Number(body.asset_type_id);
    if (!Number.isInteger(typeId) || typeId <= 0) {
      return NextResponse.json({ error: "Tipo de equipo inválido." }, { status: 422 });
    }
    changes.asset_type_id = typeId;
  }
  for (const key of ["brand", "model", "serial_number", "image_blob_path", "notes"] as const) {
    const v = body[key];
    if (v === null || typeof v === "string") {
      changes[key] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
  }
  if (body.parent_asset_id !== undefined) {
    const parentId = body.parent_asset_id == null ? null : Number(body.parent_asset_id);
    if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0 || parentId === id)) {
      return NextResponse.json({ error: "Equipo padre inválido." }, { status: 422 });
    }
    changes.parent_asset_id = parentId;
  }
  if (body.installation_date !== undefined) {
    if (body.installation_date == null || body.installation_date === "") {
      changes.installation_date = null;
    } else if (typeof body.installation_date === "string") {
      const d = new Date(body.installation_date);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Fecha de instalación inválida." },
          { status: 422 },
        );
      }
      changes.installation_date = d;
    } else {
      return NextResponse.json(
        { error: "Fecha de instalación inválida." },
        { status: 422 },
      );
    }
  }
  if (typeof body.is_active === "boolean") changes.is_active = body.is_active;

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await requirePermission("maintenance.asset:update");
    const existing = await findAssetById(id);
    if (!existing) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
    }
    const movingLocation =
      changes.location_id !== undefined &&
      changes.location_id !== existing.location_id;
    if (movingLocation && changes.location_id !== undefined) {
      const location = await findLocationById(changes.location_id);
      if (!location || !location.is_active) {
        return NextResponse.json({ error: "Ubicación inválida." }, { status: 422 });
      }
    }
    // Permission-wise the cascade rides on maintenance.asset:update because
    // it is a consequence of moving the asset, not a standalone act.
    await updateAsset(id, changes, { movingLocation });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
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
    await requirePermission("maintenance.asset:delete");
    if (!(await findAssetById(id))) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
    }
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
