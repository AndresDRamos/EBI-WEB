import { NextResponse, type NextRequest } from "next/server";
import { listAssetTypes, createAssetType } from "@/modules/maintenance/db";
import { createAssetTypeSchema } from "@/modules/maintenance/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { created, handleRoute, parseBody, unprocessable } from "@/lib/api/handler";

/** GET /api/maintenance/asset-types — catalog list (any authenticated user). */
export async function GET(request: NextRequest) {
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la lista de tipos.", label: "GET /api/maintenance/asset-types" },
    async () => {
      const activeOnly = request.nextUrl.searchParams.get("active") === "1";
      const types = await listAssetTypes(activeOnly);
      return NextResponse.json({ types });
    },
  );
}

/** POST /api/maintenance/asset-types — create a type under a category. The
 * matrícula prefix (V18) is not a separate input: it is always derived from
 * `code` (uppercased), so `code` alone must satisfy the prefix format. */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, createAssetTypeSchema);
  if (body instanceof NextResponse) return body;
  const { asset_category_id, code, name, process_ids } = body;

  return handleRoute(
    {
      guard: () => requirePermission("maintenance.asset_type:create"),
      uniqueRules: [
        {
          pattern: /UQ_asset_type_prefix/i,
          message: "Ese prefijo de matrícula ya lo usa otro tipo.",
        },
      ],
      uniqueFallback: "Ya existe un tipo con ese código en la categoría.",
      fail: "No se pudo crear el tipo.",
      label: "POST /api/maintenance/asset-types",
    },
    async () => {
      try {
        const type = await createAssetType({
          asset_category_id,
          code,
          name,
          code_prefix: code,
          process_ids,
        });
        return created({ type });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (/REFERENCE|FOREIGN KEY|conflicted/i.test(msg)) {
          return unprocessable("Categoría inválida.");
        }
        throw err;
      }
    },
  );
}
