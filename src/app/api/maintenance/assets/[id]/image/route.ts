import { NextResponse, type NextRequest } from "next/server";
import { findAssetById } from "@/modules/maintenance/db";
import { BLOB_CONTAINERS, getBlobSasUrl } from "@/lib/storage/blob";
import { requireUser } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseId } from "@/lib/api/handler";

/**
 * GET /api/maintenance/assets/[id]/image — 302 redirect to a short-lived SAS
 * URL for the asset's photo (any authenticated user). 404 when the asset has
 * no photo. Same private-blob + SAS-redirect pattern as document downloads.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo obtener la imagen.",
      label: "GET /api/maintenance/assets/[id]/image",
    },
    async () => {
      const asset = await findAssetById(id);
      if (!asset || !asset.image_blob_path) return notFound("Sin imagen.");
      const url = await getBlobSasUrl(BLOB_CONTAINERS.maintenance, asset.image_blob_path);
      return NextResponse.redirect(url);
    },
  );
}
