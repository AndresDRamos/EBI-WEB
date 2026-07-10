import { NextResponse, type NextRequest } from "next/server";
import {
  createCell,
  listCells,
  CellCodeOverflowError,
  CellDepthExceededError,
  CellLocationInvalidError,
  CellParentInvalidError,
} from "@/modules/production/db";
import { findProcessById } from "@/modules/org/db/processes";
import { createCellSchema } from "@/modules/production/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { conflict, created, handleRoute, parseBody, unprocessable } from "@/lib/api/handler";

/** GET /api/production/cells — list cells (any authenticated user). */
export async function GET(request: NextRequest) {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar las celdas.", label: "GET /api/production/cells" },
    async () => {
      const activeOnly = request.nextUrl.searchParams.get("active") === "1";
      const cells = await listCells(activeOnly);
      return NextResponse.json({ cells });
    },
  );
}

/** POST /api/production/cells — create a production cell, pre-filtered by
 * location. The code is auto-generated server-side (never accepted here). */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createCellSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("production.cell:create"),
      uniqueRules: [
        {
          pattern: /UQ_cell_parent_sequence/i,
          message: "Ya existe una celda con esa secuencia en la línea.",
        },
      ],
      uniqueFallback: "El código ya existe.",
      fail: "No se pudo crear la celda.",
      label: "POST /api/production/cells",
    },
    async () => {
      if (body.process_id !== null && !(await findProcessById(body.process_id))) {
        return unprocessable("Proceso inválido.");
      }
      try {
        const cell = await createCell({
          name: body.name,
          location_id: body.location_id,
          parent_cell_id: body.parent_cell_id,
          size_x_m: body.size_x_m,
          size_y_m: body.size_y_m,
          process_id: body.process_id,
        });
        return created({ cell });
      } catch (err) {
        if (
          err instanceof CellLocationInvalidError ||
          err instanceof CellParentInvalidError ||
          err instanceof CellDepthExceededError
        ) {
          return unprocessable(err.message);
        }
        if (err instanceof CellCodeOverflowError) {
          return conflict(err.message);
        }
        throw err;
      }
    },
  );
}
