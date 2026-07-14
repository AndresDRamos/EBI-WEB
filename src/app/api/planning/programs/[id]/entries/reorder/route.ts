import { NextResponse, type NextRequest } from "next/server";
import {
  reorderEntries,
  getProgramDetail,
  ProgramNotFoundError,
  ProgramNotDraftError,
  EntrySetMismatchError,
} from "@/modules/planning/db";
import { reorderEntriesSchema } from "@/modules/planning/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

/** POST /api/planning/programs/[id]/entries/reorder — persist a new sequence
 * for a draft's entries. Body must list exactly the program's current
 * nestings; the db layer re-validates the set. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, reorderEntriesSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("planning.program:update"),
      fail: "No se pudo reordenar.",
      label: "POST /api/planning/programs/[id]/entries/reorder",
    },
    async () => {
      try {
        await reorderEntries(id, body.ordered_nesting_ids);
        return NextResponse.json({ program: await getProgramDetail(id) });
      } catch (err) {
        if (err instanceof ProgramNotFoundError) return notFound(err.message);
        if (err instanceof ProgramNotDraftError) return unprocessable(err.message);
        if (err instanceof EntrySetMismatchError) return unprocessable(err.message);
        throw err;
      }
    },
  );
}
