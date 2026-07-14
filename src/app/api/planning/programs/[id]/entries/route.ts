import { NextResponse, type NextRequest } from "next/server";
import {
  addEntry,
  getProgramDetail,
  ProgramNotFoundError,
  ProgramNotDraftError,
  NestingNotOpenError,
  EntryExistsError,
} from "@/modules/planning/db";
import { addEntrySchema } from "@/modules/planning/schemas";
import { requirePermission } from "@/lib/auth/rbac";
import {
  badRequest,
  conflict,
  created,
  handleRoute,
  notFound,
  parseBody,
  parseId,
  unprocessable,
} from "@/lib/api/handler";

/** POST /api/planning/programs/[id]/entries — append a nesting to a draft. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, addEntrySchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("planning.program:update"),
      fail: "No se pudo agregar el nesteo.",
      label: "POST /api/planning/programs/[id]/entries",
    },
    async () => {
      try {
        await addEntry(id, body.nesting_id);
        return created({ program: await getProgramDetail(id) });
      } catch (err) {
        if (err instanceof ProgramNotFoundError) return notFound(err.message);
        if (err instanceof ProgramNotDraftError) return unprocessable(err.message);
        if (err instanceof NestingNotOpenError) return unprocessable(err.message);
        if (err instanceof EntryExistsError) return conflict(err.message);
        throw err;
      }
    },
  );
}
