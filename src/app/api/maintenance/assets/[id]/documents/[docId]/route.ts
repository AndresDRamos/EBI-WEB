import { NextResponse, type NextRequest } from "next/server";
import { findDocumentById, softDeleteDocument } from "@/modules/maintenance/db";
import { BLOB_CONTAINERS, getBlobSasUrl } from "@/lib/storage/blob";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

function parseIds(
  raw: { id: string; docId: string },
): { assetId: number; docId: number } | null {
  const assetId = Number(raw.id);
  const docId = Number(raw.docId);
  if (!Number.isInteger(assetId) || assetId <= 0) return null;
  if (!Number.isInteger(docId) || docId <= 0) return null;
  return { assetId, docId };
}

/**
 * GET /api/maintenance/assets/[id]/documents/[docId] — 302 redirect to a short-lived SAS
 * URL for the blob (any authenticated user). The container stays private.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const ids = parseIds(await params);
  if (!ids) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requireUser();
    const doc = await findDocumentById(ids.docId);
    if (!doc || doc.asset_id !== ids.assetId || !doc.is_active) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }
    const url = await getBlobSasUrl(BLOB_CONTAINERS.maintenance, doc.blob_path);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("GET /api/maintenance/assets/[id]/documents/[docId] failed:", err);
    return NextResponse.json(
      { error: "No se pudo generar el enlace de descarga." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/maintenance/assets/[id]/documents/[docId] — soft delete (admin). The blob
 * is kept (see ADR 0002); `plan_task` may reference the document.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const ids = parseIds(await params);
  if (!ids) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    await requirePermission("maintenance.document:delete");
    const doc = await findDocumentById(ids.docId);
    if (!doc || doc.asset_id !== ids.assetId) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }
    await softDeleteDocument(ids.docId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("DELETE /api/maintenance/assets/[id]/documents/[docId] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar el documento." },
      { status: 500 },
    );
  }
}
