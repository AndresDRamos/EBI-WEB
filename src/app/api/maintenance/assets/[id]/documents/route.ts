import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetById,
  listDocumentsByAsset,
  createDocument,
  DOC_TYPES,
} from "@/modules/maintenance/db";
import { BLOB_CONTAINERS, buildBlobKey, uploadBlob } from "@/lib/storage/blob";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, created, handleRoute, notFound, parseId, unprocessable } from "@/lib/api/handler";

/** Uploads are buffered in memory; keep files reasonable (manuals, CAD, photos). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** GET /api/maintenance/assets/[id]/documents — document metadata list (any user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo cargar los documentos.",
      label: "GET /api/maintenance/assets/[id]/documents",
    },
    async () => {
      const documents = await listDocumentsByAsset(id);
      return NextResponse.json({ documents });
    },
  );
}

/**
 * POST /api/maintenance/assets/[id]/documents — multipart upload (admin).
 * Fields: `file` (required), `doc_type` (required), `title` (defaults to the
 * filename). Uploads the blob first, then inserts the metadata row; a failed
 * insert leaves an orphan blob (cleaned by the ADR 0002 cleanup pass), never
 * a dangling DB reference.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("maintenance.document:create"),
      fail: "No se pudo subir el documento.",
      label: "POST /api/maintenance/assets/[id]/documents",
    },
    async (user) => {
      const asset = await findAssetById(id);
      if (!asset) return notFound("Equipo no encontrado.");

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return badRequest("Se esperaba multipart/form-data.");
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return unprocessable("Archivo requerido.");
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "El archivo excede el máximo de 50 MB." },
          { status: 413 },
        );
      }
      const docType = form.get("doc_type");
      if (
        typeof docType !== "string" ||
        !(DOC_TYPES as readonly string[]).includes(docType)
      ) {
        return unprocessable("Tipo de documento inválido.");
      }
      const titleRaw = form.get("title");
      const title =
        typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : file.name;

      const blobPath = buildBlobKey(`assets/${id}`, file.name);
      const bytes = Buffer.from(await file.arrayBuffer());
      await uploadBlob(BLOB_CONTAINERS.maintenance, blobPath, bytes, file.type || null);

      const document = await createDocument({
        asset_id: id,
        doc_type: docType,
        title,
        blob_path: blobPath,
        content_type: file.type || null,
        file_size_bytes: file.size,
        uploaded_by: user.id,
      });
      return created({ document });
    },
  );
}
