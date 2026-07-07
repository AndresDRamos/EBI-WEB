import { describe, expect, it } from "vitest";
import { parseDxf } from "../parse";
import { validateFootprint, validateLayout } from "../validate";
import {
  dxfFile,
  lwpolyline,
  tracedPlantFixture,
  untracedFixture,
} from "./fixtures";

const codes = (report: { lines: Array<{ code: string }> }) =>
  report.lines.map((l) => l.code);

describe("validateLayout", () => {
  it("accepts the traced fixture (ok, no errors)", () => {
    const report = validateLayout(parseDxf(tracedPlantFixture()));
    expect(report.ok).toBe(true);
    expect(report.lines.filter((l) => l.severity === "error")).toHaveLength(0);
    // $INSUNITS=4 (mm) is reported as ignored, never trusted.
    expect(codes(report)).toContain("insunits-ignored");
  });

  it("flags an untraced architect file with a useful report, not a crash", () => {
    const report = validateLayout(parseDxf(untracedFixture()));
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain("untraced-file");
    const untraced = report.lines.find((l) => l.code === "untraced-file")!;
    expect(untraced.message).toContain("EBI-OUTLINE");
  });

  it("rejects an open outline with a closed-polyline hint", () => {
    const report = validateLayout(
      parseDxf(
        dxfFile([
          lwpolyline(
            "EBI-OUTLINE",
            [
              [0, 0],
              [100, 0],
              [100, 60],
            ],
            false,
          ),
        ]),
      ),
    );
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain("outline-not-closed");
  });

  it("rejects multiple closed outlines", () => {
    const square = (dx: number): Array<[number, number]> => [
      [dx, 0],
      [dx + 50, 0],
      [dx + 50, 40],
      [dx, 40],
    ];
    const report = validateLayout(
      parseDxf(
        dxfFile([
          lwpolyline("EBI-OUTLINE", square(0), true),
          lwpolyline("EBI-OUTLINE", square(100), true),
        ]),
      ),
    );
    expect(codes(report)).toContain("outline-multiple");
  });

  it("flags millimeter-scale outlines with a rescale hint", () => {
    const report = validateLayout(
      parseDxf(
        dxfFile([
          lwpolyline(
            "EBI-OUTLINE",
            [
              [0, 0],
              [226000, 0],
              [226000, 178000],
              [0, 178000],
            ],
            true,
          ),
        ]),
      ),
    );
    expect(report.ok).toBe(false);
    const scale = report.lines.find((l) => l.code === "units-implausible")!;
    expect(scale.severity).toBe("error");
    expect(scale.message).toContain("milímetros");
  });

  it("flags an implausibly small outline", () => {
    const report = validateLayout(
      parseDxf(
        dxfFile([
          lwpolyline(
            "EBI-OUTLINE",
            [
              [0, 0],
              [2, 0],
              [2, 1.5],
              [0, 1.5],
            ],
            true,
          ),
        ]),
      ),
    );
    expect(codes(report)).toContain("units-implausible");
  });

  it("errors on open aisles/zones and warns on missing optional layers", () => {
    const report = validateLayout(
      parseDxf(
        dxfFile([
          lwpolyline(
            "EBI-OUTLINE",
            [
              [0, 0],
              [100, 0],
              [100, 60],
              [0, 60],
            ],
            true,
          ),
          lwpolyline(
            "EBI-AISLE",
            [
              [10, 10],
              [20, 10],
            ],
            false,
          ),
        ]),
      ),
    );
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain("aisle-not-closed");
    const missing = report.lines.filter((l) => l.code === "layer-missing");
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((l) => l.severity === "warning")).toBe(true);
  });

  it("warns when no ports were placed", () => {
    const report = validateLayout(
      parseDxf(
        dxfFile([
          lwpolyline(
            "EBI-OUTLINE",
            [
              [0, 0],
              [100, 0],
              [100, 60],
              [0, 60],
            ],
            true,
          ),
        ]),
      ),
    );
    expect(codes(report)).toContain("no-ports");
  });
});

describe("validateFootprint", () => {
  it("requires exactly one closed outline", () => {
    const report = validateFootprint(parseDxf(dxfFile([])));
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain("outline-missing");
  });

  it("uses the footprint plausibility range, not the plant one", () => {
    // 2.5 × 3.2 m: valid footprint, would be implausible as a plant.
    const report = validateFootprint(
      parseDxf(
        dxfFile([
          lwpolyline(
            "EBI-OUTLINE",
            [
              [0, 0],
              [2.5, 0],
              [2.5, 3.2],
              [0, 3.2],
            ],
            true,
          ),
        ]),
      ),
    );
    expect(report.ok).toBe(true);
  });
});
