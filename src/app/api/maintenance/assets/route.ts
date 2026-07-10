import { NextResponse, type NextRequest } from "next/server";
import {
  listAssets,
  createAsset,
  AssetTypeInvalidError,
  AssetLocationInvalidError,
  AssetCodeOverflowError,
} from "@/modules/maintenance/db";
import { createAssetSchema } from "@/modules/maintenance/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody, unprocessable } from "@/lib/api/handler";

/** GET /api/maintenance/assets — list assets (any authenticated user). */
export async function GET(request: NextRequest) {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la lista de equipos.", label: "GET /api/maintenance/assets" },
    async () => {
      const sp = request.nextUrl.searchParams;
      const locationIdRaw = sp.get("location_id");
      const locationId = locationIdRaw ? Number(locationIdRaw) : undefined;
      const status = sp.get("status") ?? undefined;
      const assets = await listAssets({
        locationId: Number.isInteger(locationId) ? locationId : undefined,
        status,
        activeOnly: sp.get("active") === "1",
      });
      return NextResponse.json({ assets });
    },
  );
}

/**
 * POST /api/maintenance/assets — create an asset. The matrícula (`code`) is
 * auto-generated server-side from the type's prefix + the location's plant;
 * the client never sends it. Status is not client-settable.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createAssetSchema);
  if (body instanceof NextResponse) return body;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset:create"),
      uniqueFallback: "El código generado ya existe, reintenta.",
      fail: "No se pudo crear el equipo.",
      label: "POST /api/maintenance/assets",
    },
    async () => {
      try {
        const asset = await createAsset(body);
        return created({ asset });
      } catch (err) {
        if (
          err instanceof AssetTypeInvalidError ||
          err instanceof AssetLocationInvalidError ||
          err instanceof AssetCodeOverflowError
        ) {
          return unprocessable(err.message);
        }
        throw err;
      }
    },
  );
}
