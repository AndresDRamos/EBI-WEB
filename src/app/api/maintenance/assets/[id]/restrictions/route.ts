import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetById,
  listRestrictionsByAsset,
  createRestriction,
} from "@/modules/maintenance/db";
import { createRestrictionSchema } from "@/modules/maintenance/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, created, handleRoute, notFound, parseBody, parseId } from "@/lib/api/handler";

/** GET /api/maintenance/assets/[id]/restrictions — list (any authenticated user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo cargar las restricciones.",
      label: "GET /api/maintenance/assets/[id]/restrictions",
    },
    async () => {
      const restrictions = await listRestrictionsByAsset(id);
      return NextResponse.json({ restrictions });
    },
  );
}

/** POST /api/maintenance/assets/[id]/restrictions — create (admin). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  const body = await parseBody(request, createRestrictionSchema);
  if (body instanceof NextResponse) return body;
  const { restriction_type, description } = body;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.restriction:create"),
      fail: "No se pudo crear la restricción.",
      label: "POST /api/maintenance/assets/[id]/restrictions",
    },
    async () => {
      const asset = await findAssetById(id);
      if (!asset) return notFound("Equipo no encontrado.");
      const restriction = await createRestriction({
        asset_id: id,
        restriction_type,
        description,
      });
      return created({ restriction });
    },
  );
}
