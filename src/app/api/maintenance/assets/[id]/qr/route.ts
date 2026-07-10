import { NextResponse, type NextRequest } from "next/server";
import { findAssetById } from "@/modules/maintenance/db";
import { buildAssetQrDataUrl } from "@/modules/maintenance/qr";
import { requireUser } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseId } from "@/lib/api/handler";

/** GET /api/maintenance/assets/[id]/qr — QR label dataURL for the in-modal
 * preview (any authenticated user, same bar as the detail GET). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo generar el código QR.",
      label: "GET /api/maintenance/assets/[id]/qr",
    },
    async () => {
      const asset = await findAssetById(id);
      if (!asset) return notFound("Equipo no encontrado.");
      const qrDataUrl = await buildAssetQrDataUrl(asset.code);
      return NextResponse.json({ qrDataUrl });
    },
  );
}
