import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { findSectionById, listSectionGrants, setSectionGrants } from "@/modules/navigation/db";
import { sectionGrantsSchema } from "@/modules/navigation/schemas";
import { requireAnyRole, requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** GET /api/nav/sections/[id]/grants — current role grants for a section (admin). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");

  return handleRoute(
    {
      guard: () => requireAnyRole(["admin"]),
      fail: "No se pudieron cargar los accesos.",
      label: "GET /api/nav/sections/[id]/grants",
    },
    async () => {
      const grants = await listSectionGrants(id);
      return NextResponse.json({ grants });
    },
  );
}

/**
 * PUT /api/nav/sections/[id]/grants — replace the full grant set for a
 * section (admin). Body: `{ grants: [{ role_id, priority }] }`. The `admin`
 * role never needs a row (app-layer sees-all rule) — grants targeting it are
 * silently dropped so the table stays a pure non-admin visibility config.
 *
 * A malformed grants array is a 400 (legacy status, not the 422 `parseBody`'s
 * schema arg would give), so validation is done manually against
 * `sectionGrantsSchema` rather than through `parseBody(request, schema)`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const raw = await parseBody(request);
  if (raw instanceof NextResponse) return raw;
  const parsed = sectionGrantsSchema.safeParse(raw);
  if (!parsed.success) return badRequest("Formato de accesos inválido.");
  const { grants } = parsed.data;

  return handleRoute(
    {
      guard: () => requirePermission("navigation.grants:update"),
      fail: "No se pudieron guardar los accesos.",
      label: "PUT /api/nav/sections/[id]/grants",
    },
    async () => {
      const current = await findSectionById(id);
      if (!current) return notFound("Sección no encontrada.");
      await setSectionGrants(id, grants);
      revalidateTag("nav", { expire: 0 });
      return NextResponse.json({ ok: true });
    },
  );
}
