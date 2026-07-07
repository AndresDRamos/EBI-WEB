import { NextResponse, type NextRequest } from "next/server";
import { runLayoutImport } from "@/modules/production/dxf";
import { createDraft } from "@/modules/production/db/layout";
import { BLOB_CONTAINERS, buildBlobKey, uploadBlob } from "@/lib/storage/blob";
import { requirePermission } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/** Buffered in memory (Node runtime); DXF plans are small (plant 7 ≈ 1.3 MB). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * POST /api/production/layouts/import — multipart DXF upload → draft layout.
 * Fields: `file` (required), `plant_id` (required), `name` (defaults to the
 * filename), `note`. The pipeline runs in memory first; only a contract-valid
 * file archives its blob and lands as a draft (blob-first, then row — ADR
 * 0002 ordering). A failing file returns 422 with the full validation report
 * so the wizard can show exactly what to fix — nothing is persisted.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("production.layout:create");

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
    const plantId = Number(form.get("plant_id"));
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return NextResponse.json({ error: "Planta inválida." }, { status: 422 });
    }
    const nameRaw = form.get("name");
    const name =
      typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : file.name;
    const noteRaw = form.get("note");
    const note = typeof noteRaw === "string" ? noteRaw : null;

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = runLayoutImport(bytes);
    if (!result.report.ok || !result.geometry) {
      return NextResponse.json(
        {
          error: "El DXF no cumple el contrato CAD.",
          report: result.report,
          meta: result.meta,
        },
        { status: 422 },
      );
    }

    const blobPath = buildBlobKey(`layouts/${plantId}`, file.name);
    await uploadBlob(BLOB_CONTAINERS.production, blobPath, bytes, "image/vnd.dxf");

    const layout = await createDraft({
      plant_id: plantId,
      name,
      note,
      source_blob_path: blobPath,
      width_m: result.geometry.width_m,
      height_m: result.geometry.height_m,
      geometry: JSON.stringify(result.geometry),
      created_by: user.id,
    });
    return NextResponse.json(
      { layout: { ...layout, geometry: result.geometry }, report: result.report },
      { status: 201 },
    );
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "";
    if (/FK_plant_layout_plant/i.test(msg)) {
      return NextResponse.json({ error: "Planta inválida." }, { status: 422 });
    }
    console.error("POST /api/production/layouts/import failed:", err);
    return NextResponse.json(
      { error: "No se pudo importar el layout." },
      { status: 500 },
    );
  }
}
