import { NextResponse, type NextRequest } from "next/server";
import {
  removeEntry,
  getProgramDetail,
  ProgramNotFoundError,
  ProgramNotDraftError,
} from "@/modules/planning/db";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseId, unprocessable } from "@/lib/api/handler";

/** DELETE /api/planning/programs/[id]/entries/[nestingId] — remove a nesting
 * from a draft program. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; nestingId: string }> },
) {
  const { id: rawId, nestingId: rawNesting } = await params;
  const id = parseId(rawId);
  const nestingId = parseId(rawNesting);
  if (!id || !nestingId) return badRequest("ID inválido.");

  return handleRoute(
    {
      guard: () => requirePermission("planning.program:update"),
      fail: "No se pudo quitar el nesteo.",
      label: "DELETE /api/planning/programs/[id]/entries/[nestingId]",
    },
    async () => {
      try {
        await removeEntry(id, nestingId);
        return NextResponse.json({ program: await getProgramDetail(id) });
      } catch (err) {
        if (err instanceof ProgramNotFoundError) return notFound(err.message);
        if (err instanceof ProgramNotDraftError) return unprocessable(err.message);
        throw err;
      }
    },
  );
}
