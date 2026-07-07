/**
 * DXF import pipeline entry points: bytes → { geometry, report, meta }.
 * decode → parse → validate → normalize; nothing here throws on bad *content*
 * (unreadable streams become an `error` report line — ADR 0006), and nothing
 * here does I/O: blob archiving and DB rows are the API layer's job.
 */
import { decodeDxf } from "./decode";
import { parseDxf, DxfParseError, type DxfExtraction } from "./parse";
import { normalizeFootprint, normalizeLayout } from "./normalize";
import { validateFootprint, validateLayout } from "./validate";
import type {
  FootprintGeometry,
  LayoutGeometry,
  ValidationReport,
} from "./geometry";

export * from "./contract";
export * from "./geometry";
export { decodeDxf, type DecodedDxf } from "./decode";
export { parseDxf, DxfParseError, type DxfExtraction } from "./parse";
export {
  normalizeLayout,
  normalizeFootprint,
  pickOutline,
  type NormalizedLayout,
} from "./normalize";
export { validateLayout, validateFootprint } from "./validate";

export interface ImportMeta {
  encoding: string;
  acadVersion: string | null;
  insunits: number | null;
}

export interface LayoutImportResult {
  /** Null when the report has blocking errors (no usable outline). */
  geometry: LayoutGeometry | null;
  report: ValidationReport;
  meta: ImportMeta | null;
}

export interface FootprintImportResult {
  geometry: FootprintGeometry | null;
  report: ValidationReport;
  meta: ImportMeta | null;
}

interface Decoded {
  extraction: DxfExtraction;
  meta: ImportMeta;
}

function decodeAndParse(bytes: Uint8Array): Decoded | ValidationReport {
  const decoded = decodeDxf(bytes);
  try {
    const extraction = parseDxf(decoded.text);
    return {
      extraction,
      meta: {
        encoding: decoded.encoding,
        acadVersion: decoded.acadVersion,
        insunits: extraction.insunits,
      },
    };
  } catch (err) {
    const detail = err instanceof DxfParseError ? ` (${err.message})` : "";
    return {
      ok: false,
      lines: [
        {
          severity: "error",
          code: "parse-failed",
          message: `El archivo no se pudo leer como DXF ASCII${detail}. Exporta como AutoCAD 2018 DXF (no binario, no DWG).`,
        },
      ],
    };
  }
}

export function runLayoutImport(bytes: Uint8Array): LayoutImportResult {
  const parsed = decodeAndParse(bytes);
  if ("ok" in parsed) return { geometry: null, report: parsed, meta: null };

  const report = validateLayout(parsed.extraction);
  const normalized = report.ok ? normalizeLayout(parsed.extraction) : null;
  if (report.ok && normalized) {
    report.lines.push({
      severity: "info",
      code: "origin-translated",
      message: `Origen normalizado: se aplicó un desplazamiento de (${normalized.offset.x}, ${normalized.offset.y}) para llevar el contorno a (0,0).`,
    });
  }
  return { geometry: normalized?.geometry ?? null, report, meta: parsed.meta };
}

export function runFootprintImport(bytes: Uint8Array): FootprintImportResult {
  const parsed = decodeAndParse(bytes);
  if ("ok" in parsed) return { geometry: null, report: parsed, meta: null };

  const report = validateFootprint(parsed.extraction);
  const geometry = report.ok ? normalizeFootprint(parsed.extraction) : null;
  return { geometry, report, meta: parsed.meta };
}
