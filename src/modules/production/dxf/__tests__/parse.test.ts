import { describe, expect, it } from "vitest";
import { parseDxf, DxfParseError } from "../parse";
import {
  dxfFile,
  insert,
  lineEntity,
  lwpolyline,
  tracedPlantFixture,
} from "./fixtures";

describe("parseDxf", () => {
  it("extracts contract entities from a traced file", () => {
    const ex = parseDxf(tracedPlantFixture());
    expect(ex.insunits).toBe(4);
    expect(ex.outline).toHaveLength(1);
    expect(ex.outline[0].closed).toBe(true);
    expect(ex.outline[0].vertices).toHaveLength(4);
    expect(ex.walls).toHaveLength(1);
    expect(ex.aisles).toHaveLength(1);
    expect(ex.zonePolys).toHaveLength(1);
    expect(ex.zoneTexts).toEqual([
      expect.objectContaining({ text: "ALMACEN" }),
    ]);
    expect(ex.columnCircles).toEqual([
      expect.objectContaining({ radius: 0.3 }),
    ]);
    expect(ex.routes).toHaveLength(1);
    expect(ex.routes[0].closed).toBe(false);
  });

  it("extracts EBI_PORT_* inserts with position and rotation", () => {
    const ex = parseDxf(tracedPlantFixture());
    expect(ex.ports).toEqual([
      { kind: "in", point: { x: 50, y: 45 }, rotation: 0 },
      { kind: "out", point: { x: 150, y: 75 }, rotation: -90 },
    ]);
  });

  it("matches layers and block names case-insensitively", () => {
    const ex = parseDxf(
      dxfFile([
        lwpolyline(
          "ebi-outline",
          [
            [0, 0],
            [50, 0],
            [50, 40],
          ],
          true,
        ),
        insert("ebi_port_in", "Ebi-Port", 1, 2, 45),
      ]),
    );
    expect(ex.outline).toHaveLength(1);
    expect(ex.ports).toEqual([
      { kind: "in", point: { x: 1, y: 2 }, rotation: 45 },
    ]);
    expect(ex.layersInFile).toContain("EBI-OUTLINE");
  });

  it("counts loose LINEs on layers that require closed polylines", () => {
    const ex = parseDxf(
      dxfFile([
        lineEntity("EBI-OUTLINE", [0, 0], [100, 0]),
        lineEntity("EBI-OUTLINE", [100, 0], [100, 60]),
        lineEntity("EBI-ZONE", [0, 0], [10, 10]),
      ]),
    );
    expect(ex.strayLinesOnClosedLayers).toEqual({
      "EBI-OUTLINE": 2,
      "EBI-ZONE": 1,
    });
  });

  it("ignores foreign blocks even on the port layer", () => {
    const ex = parseDxf(
      dxfFile([insert("CORTINA DE ANDEN", "EBI-PORT", 5, 5, 0)]),
    );
    expect(ex.ports).toHaveLength(0);
  });

  it("throws DxfParseError on a non-DXF stream", () => {
    expect(() => parseDxf("this is not a dxf file")).toThrow(DxfParseError);
  });
});
