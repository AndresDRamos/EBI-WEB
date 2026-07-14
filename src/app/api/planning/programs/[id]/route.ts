import { NextResponse, type NextRequest } from "next/server";
import {
  deleteProgram,
  getProgramDetail,
  publishProgram,
  updateProgram,
  ProgramNotFoundError,
  ProgramNotDraftError,
} from "@/modules/planning/db";
import { updateProgramSchema } from "@/modules/planning/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import {
  badRequest,
  handleRoute,
  notFound,
  parseBody,
  parseId,
  unprocessable,
} from "@/lib/api/handler";

/** GET /api/planning/programs/[id] — full program detail (right panel). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar el programa.", label: "GET /api/planning/programs/[id]" },
    async () => {
      const program = await getProgramDetail(id);
      if (!program) return notFound("Programa no encontrado.");
      return NextResponse.json({ program });
    },
  );
}

/** PATCH /api/planning/programs/[id] — update notes and/or publish a draft. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, updateProgramSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("planning.program:update"),
      uniqueFallback: "Ya existe un programa publicado para esta celda y fecha.",
      fail: "No se pudo actualizar el programa.",
      label: "PATCH /api/planning/programs/[id]",
    },
    async () => {
      try {
        if (body.notes !== undefined) await updateProgram(id, { notes: body.notes });
        if (body.status === "published") await publishProgram(id);
        const program = await getProgramDetail(id);
        if (!program) return notFound("Programa no encontrado.");
        return NextResponse.json({ program });
      } catch (err) {
        if (err instanceof ProgramNotFoundError) return notFound(err.message);
        if (err instanceof ProgramNotDraftError) return unprocessable(err.message);
        throw err;
      }
    },
  );
}

/** DELETE /api/planning/programs/[id] — delete a draft (entries cascade). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("planning.program:delete"),
      fail: "No se pudo eliminar el programa.",
      label: "DELETE /api/planning/programs/[id]",
    },
    async () => {
      try {
        await deleteProgram(id);
        return NextResponse.json({ ok: true });
      } catch (err) {
        if (err instanceof ProgramNotFoundError) return notFound(err.message);
        if (err instanceof ProgramNotDraftError) return unprocessable(err.message);
        throw err;
      }
    },
  );
}
