import { NextResponse, type NextRequest } from "next/server";
import { findAssetById } from "@/modules/maintenance/db";
import { BLOB_CONTAINERS, getBlobSasUrl } from "@/lib/storage/blob";
import { requireUser } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const asset = await findAssetById(id);
    if (!asset || !asset.image_blob_path) {
      return NextResponse.json({ error: "Sin imagen." }, { status: 404 });
    }
    const url = await getBlobSasUrl(
      BLOB_CONTAINERS.maintenance,
      asset.image_blob_path,
    );
    return NextResponse.redirect(url);
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/maintenance/assets/[id]/image failed:", err);
    return NextResponse.json({ error: "No se pudo obtener la imagen." }, { status: 500 });
  }
}
