import { NextResponse, type NextRequest } from "next/server";
import { findDocumentById, softDeleteDocument } from "@/modules/maintenance/db";
import { BLOB_CONTAINERS, getBlobSasUrl } from "@/lib/storage/blob";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseId } from "@/lib/api/handler";

function parseIds(
  raw: { id: string; docId: string },
): { assetId: number; docId: number } | null {
  const assetId = parseId(raw.id);
  const docId = parseId(raw.docId);
  if (assetId == null || docId == null) return null;
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
  if (!ids) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: requireUser,
      fail: "No se pudo generar el enlace de descarga.",
      label: "GET /api/maintenance/assets/[id]/documents/[docId]",
    },
    async () => {
      const doc = await findDocumentById(ids.docId);
      if (!doc || doc.asset_id !== ids.assetId || !doc.is_active) {
        return notFound("Documento no encontrado.");
      }
      const url = await getBlobSasUrl(BLOB_CONTAINERS.maintenance, doc.blob_path);
      return NextResponse.redirect(url, 302);
    },
  );
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
  if (!ids) return badRequest("ID inválido.");
  return handleRoute(
    {
      guard: () => requirePermission("maintenance.document:delete"),
      fail: "No se pudo eliminar el documento.",
      label: "DELETE /api/maintenance/assets/[id]/documents/[docId]",
    },
    async () => {
      const doc = await findDocumentById(ids.docId);
      if (!doc || doc.asset_id !== ids.assetId) {
        return notFound("Documento no encontrado.");
      }
      await softDeleteDocument(ids.docId);
      return NextResponse.json({ ok: true });
    },
  );
}
