import { describe, expect, it } from "vitest";
import { runFootprintImport, runLayoutImport } from "../index";
import { dxfFile, lwpolyline, tracedPlantFixture, untracedFixture } from "./fixtures";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("runLayoutImport", () => {
  it("produces geometry + ok report for a contract-compliant file", () => {
    const result = runLayoutImport(bytes(tracedPlantFixture()));
    expect(result.report.ok).toBe(true);
    expect(result.geometry).not.toBeNull();
    expect(result.geometry!.width_m).toBe(100);
    expect(result.geometry!.ports).toHaveLength(2);
    expect(result.meta).toEqual({
      encoding: "utf-8",
      acadVersion: "AC1032",
      insunits: 4,
    });
    expect(result.report.lines.map((l) => l.code)).toContain(
      "origin-translated",
    );
  });

  it("returns a useful report and null geometry for an untraced file", () => {
    const result = runLayoutImport(bytes(untracedFixture()));
    expect(result.report.ok).toBe(false);
    expect(result.geometry).toBeNull();
    expect(result.report.lines.map((l) => l.code)).toContain("untraced-file");
  });

  it("turns an unreadable stream into a parse-failed error line, not a throw", () => {
    const result = runLayoutImport(bytes("PK this is a zip, not a dxf"));
    expect(result.report.ok).toBe(false);
    expect(result.geometry).toBeNull();
    expect(result.report.lines).toEqual([
      expect.objectContaining({ severity: "error", code: "parse-failed" }),
    ]);
  });
});

describe("runFootprintImport", () => {
  it("imports a small machine top view", () => {
    const result = runFootprintImport(
      bytes(
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
    expect(result.report.ok).toBe(true);
    expect(result.geometry).toEqual(
      expect.objectContaining({ width_m: 2.5, depth_m: 3.2 }),
    );
  });

  it("rejects a plant-sized outline as a footprint", () => {
    // 150 × 80 m — beyond FOOTPRINT_MAX_SIDE_M (100 m per side).
    const result = runFootprintImport(
      bytes(
        dxfFile([
          lwpolyline(
            "EBI-OUTLINE",
            [
              [0, 0],
              [150, 0],
              [150, 80],
              [0, 80],
            ],
            true,
          ),
        ]),
      ),
    );
    expect(result.report.ok).toBe(false);
    expect(result.geometry).toBeNull();
    expect(result.report.lines.map((l) => l.code)).toContain(
      "units-implausible",
    );
  });
});
