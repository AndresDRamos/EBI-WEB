import { NextResponse, type NextRequest } from "next/server";
import { BLOB_CONTAINERS, buildBlobKey, uploadBlob } from "@/lib/storage/blob";
import { requireUser, ForbiddenError } from "@/lib/auth/rbac";
import { getPermissionCodesForRoles } from "@/modules/org/db/permissions";
import { authErrorResponse } from "@/lib/auth/api";

/** Equipment photos are buffered in memory — keep them modest. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/maintenance/assets/image — upload a single equipment photo and get
 * back its `blob_path`. The client then persists that path into the asset's
 * `image_blob_path` on create/edit (the photo is captured before the asset row
 * exists in the create flow, so this endpoint is asset-agnostic). Gated to
 * users who can create OR update assets (admin bypasses).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user.roles.includes("admin")) {
      const codes = await getPermissionCodesForRoles(user.roles);
      const canManage =
        codes.includes("maintenance.asset:create") ||
        codes.includes("maintenance.asset:update");
      if (!canManage) throw new ForbiddenError();
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Se esperaba multipart/form-data." },
        { status: 400 },
      );
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Imagen requerida." }, { status: 422 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "La imagen excede el máximo de 8 MB." },
        { status: 413 },
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato inválido (usa JPG, PNG o WEBP)." },
        { status: 422 },
      );
    }

    const blobPath = buildBlobKey("assets/images", file.name);
    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadBlob(BLOB_CONTAINERS.maintenance, blobPath, bytes, file.type);

    return NextResponse.json({ blob_path: blobPath }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/maintenance/assets/image failed:", err);
    return NextResponse.json(
      { error: "No se pudo subir la imagen." },
      { status: 500 },
    );
  }
}
