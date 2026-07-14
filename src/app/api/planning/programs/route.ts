import { NextResponse, type NextRequest } from "next/server";
import { ensureDraftProgram, getDatePrograms, getProgramDetail } from "@/modules/planning/db";
import { createProgramSchema, parseProgramDate, programDateStringSchema } from "@/modules/planning/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/planning/programs?date=YYYY-MM-DD — the timeline: one working
 * program per cell for the date (draft preferred over published). */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("date");
  const parsed = programDateStringSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Fecha inválida.");

  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar los programas.", label: "GET /api/planning/programs" },
    async () => NextResponse.json({ programs: await getDatePrograms(parseProgramDate(parsed.data)) }),
  );
}

/** POST /api/planning/programs — idempotent "ensure draft" for a cell/date/
 * shift (creates the draft on the first nesting drop, else returns the
 * existing one). */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createProgramSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("planning.program:create"),
      fail: "No se pudo crear el programa.",
      label: "POST /api/planning/programs",
    },
    async (user) => {
      const id = await ensureDraftProgram(
        body.cell_id,
        parseProgramDate(body.program_date),
        body.shift,
        user.id,
      );
      return created({ program: await getProgramDetail(id) });
    },
  );
}
