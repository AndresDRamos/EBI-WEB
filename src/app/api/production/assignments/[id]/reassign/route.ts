import { NextResponse, type NextRequest } from "next/server";
import {
  findAssignmentById,
  findCellById,
  reassign,
} from "@/modules/production/db";
import { findAssetById, assetTypeSupportsProcess } from "@/modules/maintenance/db";
import { reassignAssignmentSchema } from "@/modules/production/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, conflict, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/** POST /api/production/assignments/[id]/reassign — historized move: closes
 * the current row and opens a new one against the target cell in one
 * transaction. Requires both assignment permissions (it closes AND creates). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, reassignAssignmentSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: async () => {
        const user = await requirePermission("production.assignment:close");
        await requirePermission("production.assignment:create");
        return user;
      },
      uniqueFallback: "El equipo ya tiene una asignación vigente en la celda destino.",
      fail: "No se pudo reasignar el equipo.",
      label: "POST /api/production/assignments/[id]/reassign",
    },
    async (user) => {
      const existing = await findAssignmentById(id);
      if (!existing) return notFound("Asignación no encontrada.");
      if (existing.valid_to !== null) return conflict("La asignación ya está cerrada.");
      if (existing.cell_id === body.to_cell_id) {
        return unprocessable("La celda destino es la misma que la actual.");
      }
      const toCell = await findCellById(body.to_cell_id);
      if (!toCell) return unprocessable("Celda destino inválida.");
      // Cross-schema invariant (V18, app-enforced — house style, no triggers):
      // an asset only works in a cell that shares its physical location.
      const asset = await findAssetById(existing.asset_id);
      if (!asset || toCell.location_id === null || toCell.location_id !== asset.location_id) {
        return unprocessable("La celda destino no está en la misma ubicación que el equipo.");
      }
      // Cross-schema invariant (V19, app-enforced — house style, no triggers):
      // an asset only works in a cell whose declared process its type supports.
      if (
        toCell.process_id !== null &&
        !(await assetTypeSupportsProcess(asset.asset_type_id, toCell.process_id))
      ) {
        return unprocessable("El tipo del equipo no soporta el proceso de la celda destino.");
      }
      const assignment = await reassign({
        assignment_id: id,
        to_cell_id: body.to_cell_id,
        role_label: body.role_label,
        note: body.note,
        created_by: user.id,
      });
      if (!assignment) return conflict("La asignación ya está cerrada.");
      return NextResponse.json({ assignment }, { status: 201 });
    },
  );
}
