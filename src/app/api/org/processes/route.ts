import { NextResponse, type NextRequest } from "next/server";
import { listProcesses, createProcess } from "@/modules/org/db/processes";
import { createProcessSchema } from "@/modules/org/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/org/processes — list company processes (any authenticated user). */
export async function GET() {
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo cargar la lista de procesos.",
      label: "GET /api/org/processes",
    },
    async () => {
      const processes = await listProcesses();
      return NextResponse.json({ processes });
    },
  );
}

/** POST /api/org/processes — create a process (admin panel). */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createProcessSchema);
  if (body instanceof NextResponse) return body;
  const { code, name, description } = body;

  return handleRoute(
    {
      guard: () => requirePermission("org.process:create"),
      uniqueFallback: "El código ya existe.",
      fail: "No se pudo crear el proceso.",
      label: "POST /api/org/processes",
    },
    async () => {
      const process = await createProcess({ code, name, description });
      return created({ process });
    },
  );
}
