import { NextResponse, type NextRequest } from "next/server";
import {
  findAssetById,
  listDocumentsByAsset,
  createDocument,
  DOC_TYPES,
} from "@/modules/maintenance/db";
import { buildBlobKey, uploadDocumentBlob } from "@/lib/storage/blob";
import { requireUser, requireAnyRole } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/** Uploads are buffered in memory; keep files reasonable (manuals, CAD, photos). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/maintenance/assets/[id]/documents — document metadata list (any user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const documents = await listDocumentsByAsset(id);
    return NextResponse.json({ documents });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
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
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    const user = await requireAnyRole(["admin"]);
    const asset = await findAssetById(id);
    if (!asset) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
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
      return NextResponse.json({ error: "Archivo requerido." }, { status: 422 });
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
      return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 422 });
    }
    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : file.name;

    const blobPath = buildBlobKey(id, file.name);
    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadDocumentBlob(blobPath, bytes, file.type || null);

    const document = await createDocument({
      asset_id: id,
      doc_type: docType,
      title,
      blob_path: blobPath,
      content_type: file.type || null,
      file_size_bytes: file.size,
      uploaded_by: user.id,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("POST /api/maintenance/assets/[id]/documents failed:", err);
    return NextResponse.json(
      { error: "No se pudo subir el documento." },
      { status: 500 },
    );
  }
}
