import { NextResponse, type NextRequest } from "next/server";
import {
  findFootprintByAsset,
  upsertFootprint,
} from "@/modules/production/db/footprint";
import { runFootprintImport, rectangleFootprint } from "@/modules/production/dxf";
import { findAssetById } from "@/modules/maintenance/db";
import { BLOB_CONTAINERS, buildBlobKey, uploadBlob } from "@/lib/storage/blob";
import { rectangleFootprintSchema } from "@/modules/production/schemas";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { badRequest, handleRoute, notFound, parseBody, parseId, unprocessable } from "@/lib/api/handler";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** GET /api/production/footprints/[assetId] — the asset's footprint (any user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const assetId = parseId((await params).assetId);
  if (!assetId) return badRequest("ID inválido.");
  return handleRoute(
    { guard: requireUser, fail: "No se pudo cargar la huella.", label: "GET /api/production/footprints/[assetId]" },
    async () => {
      const footprint = await findFootprintByAsset(assetId);
      if (!footprint) return notFound("El equipo no tiene huella registrada.");
      return NextResponse.json({
        footprint: { ...footprint, geometry: JSON.parse(footprint.geometry) },
      });
    },
  );
}

/**
 * PUT /api/production/footprints/[assetId] — create/replace the asset's
 * footprint (one per asset, edit-in-place). Two modes by content type:
 * `application/json` = W×D rectangle quick-create; `multipart/form-data`
 * with a `file` field = small DXF per the CAD contract (422 + report when it
 * fails validation; the blob is archived only on success — blob-first order).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const assetId = parseId((await params).assetId);
  if (!assetId) return badRequest("ID inválido.");

  // The two content-type branches read the request body differently
  // (`formData()` vs JSON), so — unlike other handlers — body parsing can't
  // happen before `handleRoute`: which parser to use is only known once
  // we're inside, after checking the `content-type` header (multipart never
  // goes through `parseBody`/a zod schema at all).
  return handleRoute(
    {
      guard: () => requirePermission("production.footprint:manage"),
      fail: "No se pudo guardar la huella.",
      label: "PUT /api/production/footprints/[assetId]",
    },
    async (user) => {
      const asset = await findAssetById(assetId);
      if (!asset) return notFound("Equipo no encontrado.");

      const contentType = request.headers.get("content-type") ?? "";

      if (contentType.includes("multipart/form-data")) {
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
        const bytes = Buffer.from(await file.arrayBuffer());
        const result = runFootprintImport(bytes);
        if (!result.report.ok || !result.geometry) {
          return NextResponse.json(
            {
              error: "El DXF de huella no cumple el contrato CAD.",
              report: result.report,
            },
            { status: 422 },
          );
        }
        const blobPath = buildBlobKey(`footprints/${assetId}`, file.name);
        await uploadBlob(BLOB_CONTAINERS.production, blobPath, bytes, "image/vnd.dxf");
        const footprint = await upsertFootprint({
          asset_id: assetId,
          width_m: result.geometry.width_m,
          depth_m: result.geometry.depth_m,
          geometry: JSON.stringify(result.geometry),
          source_kind: "dxf",
          source_blob_path: blobPath,
          created_by: user.id,
        });
        return NextResponse.json({
          footprint: { ...footprint, geometry: result.geometry },
          report: result.report,
        });
      }

      const body = await parseBody(request, rectangleFootprintSchema);
      if (body instanceof NextResponse) return body;

      const geometry = rectangleFootprint(body.width_m, body.depth_m);
      const footprint = await upsertFootprint({
        asset_id: assetId,
        width_m: geometry.width_m,
        depth_m: geometry.depth_m,
        geometry: JSON.stringify(geometry),
        source_kind: "rectangle",
        created_by: user.id,
      });
      return NextResponse.json({ footprint: { ...footprint, geometry } });
    },
  );
}
