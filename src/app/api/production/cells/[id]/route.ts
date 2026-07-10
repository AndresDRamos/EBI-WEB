import { NextResponse, type NextRequest } from "next/server";
import {
  cellHasChildren,
  findCellById,
  getCellDetail,
  updateCell,
} from "@/modules/production/db";
import { findProcessById } from "@/modules/org/db/processes";
import { updateCellSchema } from "@/modules/production/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/** GET /api/production/cells/[id] — cell detail with current composition and
 * closed history (any authenticated user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la celda.", label: "GET /api/production/cells/[id]" },
    async () => {
      const detail = await getCellDetail(id);
      if (!detail) return notFound("Celda no encontrada.");
      return NextResponse.json(detail);
    },
  );
}

/** PATCH /api/production/cells/[id] — update a production cell. `code` and
 * `location_id` are immutable (the code encodes the location). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateCellSchema);
  if (body instanceof NextResponse) return body;

  const changes: Parameters<typeof updateCell>[1] = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.parent_cell_id !== undefined) changes.parent_cell_id = body.parent_cell_id;
  if (body.size_x_m !== undefined) changes.size_x_m = body.size_x_m;
  if (body.size_y_m !== undefined) changes.size_y_m = body.size_y_m;
  if (body.process_id !== undefined) changes.process_id = body.process_id;
  if (body.is_active !== undefined) changes.is_active = body.is_active;

  return handleRoute(
    {
      guard: () => requirePermission("production.cell:update"),
      uniqueRules: [
        {
          pattern: /UQ_cell_parent_sequence/i,
          message: "Ya existe una celda con esa secuencia en la línea.",
        },
      ],
      uniqueFallback: "El código ya existe.",
      fail: "No se pudo actualizar la celda.",
      label: "PATCH /api/production/cells/[id]",
    },
    async () => {
      const existing = await findCellById(id);
      if (!existing) return notFound("Celda no encontrada.");
      if (changes.process_id != null && !(await findProcessById(changes.process_id))) {
        return unprocessable("Proceso inválido.");
      }
      if (changes.parent_cell_id !== undefined && changes.parent_cell_id !== null) {
        // Depth-1, both directions: the target parent cannot itself have a
        // parent, and this cell cannot already have children of its own.
        const parent = await findCellById(changes.parent_cell_id);
        if (!parent || !parent.is_active || parent.location_id !== existing.location_id) {
          return unprocessable("La celda padre no está en la misma ubicación o no existe.");
        }
        if (parent.parent_cell_id !== null) {
          return unprocessable(
            "Una celda hija no puede tener celdas hijas a su vez (profundidad máxima: 1).",
          );
        }
        if (await cellHasChildren(id)) {
          return unprocessable("Esta celda ya tiene celdas hijas: no puede pasar a ser hija de otra.");
        }
      }
      await updateCell(id, changes);
      return NextResponse.json({ ok: true });
    },
  );
}
