import { NextResponse, type NextRequest } from "next/server";
import {
  findFootprintByAsset,
  upsertFootprint,
} from "@/modules/production/db/footprint";
import { runFootprintImport, rectangleFootprint } from "@/modules/production/dxf";
import { findAssetById } from "@/modules/maintenance/db";
import { BLOB_CONTAINERS, buildBlobKey, uploadBlob } from "@/lib/storage/blob";
import { requireUser, requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function parseAssetId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/production/footprints/[assetId] — the asset's footprint (any user). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const assetId = parseAssetId((await params).assetId);
  if (!assetId) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await requireUser();
    const footprint = await findFootprintByAsset(assetId);
    if (!footprint) {
      return NextResponse.json(
        { error: "El equipo no tiene huella registrada." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      footprint: { ...footprint, geometry: JSON.parse(footprint.geometry) },
    });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

interface RectangleBody {
  source_kind?: unknown;
  width_m?: unknown;
  depth_m?: unknown;
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
  const assetId = parseAssetId((await params).assetId);
  if (!assetId) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    const user = await requirePermission("production.footprint:manage");
    const asset = await findAssetById(assetId);
    if (!asset) {
      return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
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

    let body: RectangleBody;
    try {
      body = (await parseJsonBody(request)) as RectangleBody;
    } catch {
      return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
    }
    if (body.source_kind !== "rectangle") {
      return NextResponse.json(
        { error: "source_kind debe ser 'rectangle' (o envía un DXF multipart)." },
        { status: 422 },
      );
    }
    const width = Number(body.width_m);
    const depth = Number(body.depth_m);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(depth) ||
      width <= 0 ||
      depth <= 0 ||
      width > 100 ||
      depth > 100
    ) {
      return NextResponse.json(
        { error: "Dimensiones inválidas (0 < metros ≤ 100)." },
        { status: 422 },
      );
    }
    const geometry = rectangleFootprint(width, depth);
    const footprint = await upsertFootprint({
      asset_id: assetId,
      width_m: geometry.width_m,
      depth_m: geometry.depth_m,
      geometry: JSON.stringify(geometry),
      source_kind: "rectangle",
      created_by: user.id,
    });
    return NextResponse.json({ footprint: { ...footprint, geometry } });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("PUT /api/production/footprints/[assetId] failed:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la huella." },
      { status: 500 },
    );
  }
}
