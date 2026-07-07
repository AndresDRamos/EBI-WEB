/**
 * Contract validation over the raw extraction. Violations never throw — every
 * rule maps to a report line (Spanish message + stable English code); `error`
 * lines block confirming the draft, `warning`/`info` do not. The canonical
 * hard case: an untraced architect file must yield a useful report, not a
 * crash. Pure module — no I/O.
 */
import {
  ALL_EBI_LAYERS,
  EBI_LAYERS,
  FOOTPRINT_MAX_SIDE_M,
  FOOTPRINT_MIN_SIDE_M,
  PLANT_MAX_SIDE_M,
  PLANT_MIN_SIDE_M,
} from "./contract";
import type { DxfExtraction } from "./parse";
import { pickOutline } from "./normalize";
import { bboxOf, type ReportLine, type ValidationReport } from "./geometry";

function line(
  severity: ReportLine["severity"],
  code: string,
  message: string,
): ReportLine {
  return { severity, code, message };
}

function finish(lines: ReportLine[]): ValidationReport {
  return { ok: !lines.some((l) => l.severity === "error"), lines };
}

/**
 * Extents plausibility instead of `$INSUNITS` (the header lies — plant 7
 * declares mm over meter geometry). Shared by plant and footprint variants.
 */
function checkScale(
  spanX: number,
  spanY: number,
  minSide: number,
  maxSide: number,
): ReportLine | null {
  const longest = Math.max(spanX, spanY);
  const shortest = Math.min(spanX, spanY);
  if (longest > maxSide) {
    const mmHint =
      longest / 1000 >= minSide && longest / 1000 <= maxSide
        ? " Parece estar dibujado en milímetros: reescala a metros (1 unidad = 1 m)."
        : "";
    return line(
      "error",
      "units-implausible",
      `El contorno mide ${spanX.toFixed(1)} × ${spanY.toFixed(1)} unidades — fuera del rango plausible en metros (${minSide}–${maxSide} m por lado).${mmHint}`,
    );
  }
  if (shortest < minSide) {
    return line(
      "error",
      "units-implausible",
      `El contorno mide ${spanX.toFixed(3)} × ${spanY.toFixed(3)} unidades — demasiado pequeño para estar en metros (mínimo ${minSide} m por lado).`,
    );
  }
  return null;
}

function checkInsunits(ex: DxfExtraction, lines: ReportLine[]): void {
  if (ex.insunits !== null && ex.insunits !== 6) {
    // 6 = meters. Informational only: the importer decides by extents.
    lines.push(
      line(
        "info",
        "insunits-ignored",
        `La cabecera declara $INSUNITS=${ex.insunits}; el importador la ignora y valida la escala por las dimensiones del contorno.`,
      ),
    );
  }
}

export function validateLayout(ex: DxfExtraction): ValidationReport {
  const lines: ReportLine[] = [];
  const present = new Set(ex.layersInFile);
  const ebiPresent = ALL_EBI_LAYERS.filter((l) => present.has(l));

  if (ebiPresent.length === 0) {
    lines.push(
      line(
        "error",
        "untraced-file",
        `El archivo no contiene ninguna capa EBI-*: parece el plano del arquitecto sin calcar. Traza las capas del contrato CAD (${ALL_EBI_LAYERS.join(", ")}) y vuelve a exportar.`,
      ),
    );
    checkInsunits(ex, lines);
    return finish(lines);
  }

  lines.push(
    line(
      "info",
      "layers-found",
      `Capas EBI encontradas: ${ebiPresent.join(", ")}.`,
    ),
  );

  // --- outline: exactly one closed polyline, plausible in meters -----------
  const closedOutlines = ex.outline.filter(
    (p) => p.closed && p.vertices.length >= 3,
  );
  if (!present.has(EBI_LAYERS.OUTLINE)) {
    lines.push(
      line(
        "error",
        "outline-missing",
        `Falta la capa ${EBI_LAYERS.OUTLINE} (obligatoria): una polilínea cerrada con el contorno de la planta.`,
      ),
    );
  } else if (closedOutlines.length === 0) {
    const open = ex.outline.length;
    lines.push(
      line(
        "error",
        "outline-not-closed",
        open > 0
          ? `${EBI_LAYERS.OUTLINE} tiene ${open} polilínea(s) pero ninguna cerrada — usa PEDIT → Close, no un vértice que coincida con el primero.`
          : `${EBI_LAYERS.OUTLINE} existe pero no contiene ninguna polilínea cerrada.`,
      ),
    );
  } else if (closedOutlines.length > 1) {
    lines.push(
      line(
        "error",
        "outline-multiple",
        `${EBI_LAYERS.OUTLINE} contiene ${closedOutlines.length} polilíneas cerradas; debe haber exactamente una (el contorno exterior).`,
      ),
    );
  } else {
    const box = bboxOf(closedOutlines[0].vertices);
    if (box) {
      const scale = checkScale(
        box.maxX - box.minX,
        box.maxY - box.minY,
        PLANT_MIN_SIDE_M,
        PLANT_MAX_SIDE_M,
      );
      if (scale) lines.push(scale);
    }
  }

  // --- missing optional layers ---------------------------------------------
  for (const l of ALL_EBI_LAYERS) {
    if (l !== EBI_LAYERS.OUTLINE && !present.has(l)) {
      lines.push(
        line("warning", "layer-missing", `La capa ${l} no está en el archivo.`),
      );
    }
  }

  // --- closed-polyline rule on aisles/zones/columns -------------------------
  const openAisles = ex.aisles.filter((a) => !a.closed).length;
  if (openAisles > 0) {
    lines.push(
      line(
        "error",
        "aisle-not-closed",
        `${EBI_LAYERS.AISLE}: ${openAisles} polilínea(s) abiertas — los pasillos deben ser polilíneas cerradas.`,
      ),
    );
  }
  const openZones = ex.zonePolys.filter((z) => !z.closed).length;
  if (openZones > 0) {
    lines.push(
      line(
        "error",
        "zone-not-closed",
        `${EBI_LAYERS.ZONE}: ${openZones} polilínea(s) abiertas — las zonas deben ser polilíneas cerradas.`,
      ),
    );
  }
  const openColumns = ex.columnPolys.filter((c) => !c.closed).length;
  if (openColumns > 0) {
    lines.push(
      line(
        "warning",
        "column-not-closed",
        `${EBI_LAYERS.COLUMN}: ${openColumns} polilínea(s) abiertas fueron descartadas (usa polilíneas cerradas o círculos).`,
      ),
    );
  }
  for (const [layer, n] of Object.entries(ex.strayLinesOnClosedLayers)) {
    lines.push(
      line(
        "warning",
        "loose-lines",
        `${layer}: ${n} LINE(s) sueltas ignoradas — esta capa requiere polilíneas cerradas.`,
      ),
    );
  }

  // --- ports and zone labels -------------------------------------------------
  if (ex.ports.length === 0) {
    lines.push(
      line(
        "warning",
        "no-ports",
        "No se encontró ningún bloque EBI_PORT_IN / EBI_PORT_OUT — el layout no tendrá puntos de entrada/salida.",
      ),
    );
  }
  const closedZones = ex.zonePolys.filter(
    (z) => z.closed && z.vertices.length >= 3,
  );
  if (closedZones.length > 0 && ex.zoneTexts.length === 0) {
    lines.push(
      line(
        "warning",
        "zones-unlabeled",
        `${closedZones.length} zona(s) sin texto de etiqueta en ${EBI_LAYERS.ZONE}.`,
      ),
    );
  }

  checkInsunits(ex, lines);
  return finish(lines);
}

export function validateFootprint(ex: DxfExtraction): ValidationReport {
  const lines: ReportLine[] = [];
  const outline = pickOutline(ex);
  const closedOutlines = ex.outline.filter(
    (p) => p.closed && p.vertices.length >= 3,
  );

  if (closedOutlines.length === 0) {
    lines.push(
      line(
        "error",
        "outline-missing",
        `El DXF de huella requiere exactamente una polilínea cerrada en ${EBI_LAYERS.OUTLINE} con la vista superior del equipo.`,
      ),
    );
  } else if (closedOutlines.length > 1) {
    lines.push(
      line(
        "error",
        "outline-multiple",
        `${EBI_LAYERS.OUTLINE} contiene ${closedOutlines.length} polilíneas cerradas; debe haber exactamente una.`,
      ),
    );
  } else if (outline) {
    const box = bboxOf(outline.vertices);
    if (box) {
      const scale = checkScale(
        box.maxX - box.minX,
        box.maxY - box.minY,
        FOOTPRINT_MIN_SIDE_M,
        FOOTPRINT_MAX_SIDE_M,
      );
      if (scale) lines.push(scale);
    }
  }

  checkInsunits(ex, lines);
  return finish(lines);
}
