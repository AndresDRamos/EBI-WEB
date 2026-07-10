import { NextResponse, type NextRequest } from "next/server";
import {
  listAssetCategories,
  createAssetCategory,
} from "@/modules/maintenance/db";
import { createAssetCategorySchema } from "@/modules/maintenance/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody } from "@/lib/api/handler";

/** GET /api/maintenance/asset-categories — catalog list (any authenticated user). */
export async function GET(request: NextRequest) {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la lista de categorías.", label: "GET /api/maintenance/asset-categories" },
    async () => {
      const activeOnly = request.nextUrl.searchParams.get("active") === "1";
      const categories = await listAssetCategories(activeOnly);
      return NextResponse.json({ categories });
    },
  );
}

/** POST /api/maintenance/asset-categories — create a category. Since V18 the
 * matrícula prefix lives on the asset TYPE, not here. */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createAssetCategorySchema);
  if (body instanceof NextResponse) return body;
  const { code, name } = body;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset_category:create"),
      uniqueFallback: "El código ya existe.",
      fail: "No se pudo crear la categoría.",
      label: "POST /api/maintenance/asset-categories",
    },
    async () => {
      const category = await createAssetCategory({ code, name });
      return created({ category });
    },
  );
}
