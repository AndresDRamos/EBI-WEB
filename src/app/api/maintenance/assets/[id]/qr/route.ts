import { NextResponse, type NextRequest } from "next/server";
import { findAssetById } from "@/modules/maintenance/db";
import { buildAssetQrDataUrl } from "@/modules/maintenance/qr";
import { requireUser } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/maintenance/assets/[id]/qr — QR label dataURL for the in-modal
 * preview (any authenticated user, same bar as the detail GET). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const asset = await findAssetById(id);
    if (!asset) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
    }
    const qrDataUrl = await buildAssetQrDataUrl(asset.code);
    return NextResponse.json({ qrDataUrl });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
