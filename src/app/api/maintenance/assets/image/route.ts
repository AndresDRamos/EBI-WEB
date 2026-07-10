import { NextResponse, type NextRequest } from "next/server";
import { BLOB_CONTAINERS, buildBlobKey, uploadBlob } from "@/lib/storage/blob";
import { requireUser, ForbiddenError, type SessionUser } from "@/lib/auth/rbac";
import { getPermissionCodesForRoles } from "@/modules/org/db/permissions";
import { badRequest, created, handleRoute, unprocessable } from "@/lib/api/handler";

/** Equipment photos are buffered in memory — keep them modest. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Gated to users who can create OR update assets (admin bypasses). */
async function guard(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.roles.includes("admin")) {
    const codes = await getPermissionCodesForRoles(user.roles);
    const canManage =
      codes.includes("maintenance.asset:create") || codes.includes("maintenance.asset:update");
    if (!canManage) throw new ForbiddenError();
  }
  return user;
}

/**
 * POST /api/maintenance/assets/image — upload a single equipment photo and get
 * back its `blob_path`. The client then persists that path into the asset's
 * `image_blob_path` on create/edit (the photo is captured before the asset row
 * exists in the create flow, so this endpoint is asset-agnostic). Gated to
 * users who can create OR update assets (admin bypasses).
 */
export async function POST(request: NextRequest) {
  return handleRoute(
    { guard, fail: "No se pudo subir la imagen.", label: "POST /api/maintenance/assets/image" },
    async () => {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return badRequest("Se esperaba multipart/form-data.");
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return unprocessable("Imagen requerida.");
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "La imagen excede el máximo de 8 MB." },
          { status: 413 },
        );
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        return unprocessable("Formato inválido (usa JPG, PNG o WEBP).");
      }

      const blobPath = buildBlobKey("assets/images", file.name);
      const bytes = Buffer.from(await file.arrayBuffer());
      await uploadBlob(BLOB_CONTAINERS.maintenance, blobPath, bytes, file.type);

      return created({ blob_path: blobPath });
    },
  );
}
