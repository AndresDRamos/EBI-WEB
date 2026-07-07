import { describe, expect, it } from "vitest";
import { parseDxf } from "../parse";
import { normalizeFootprint, normalizeLayout } from "../normalize";
import { dxfFile, insert, lwpolyline, tracedPlantFixture } from "./fixtures";

describe("normalizeLayout", () => {
  const normalized = normalizeLayout(parseDxf(tracedPlantFixture()));

  it("auto-translates the outline bbox minimum to (0,0) and reports the offset", () => {
    expect(normalized).not.toBeNull();
    expect(normalized!.offset).toEqual({ x: 50, y: 30 });
    expect(normalized!.geometry.offset_applied).toEqual({ x: 50, y: 30 });
    expect(normalized!.geometry.outline[0]).toEqual({ x: 0, y: 0 });
  });

  it("computes canvas extents in meters from the outline", () => {
    expect(normalized!.geometry.width_m).toBe(100);
    expect(normalized!.geometry.height_m).toBe(60);
    expect(normalized!.geometry.units).toBe("m");
  });

  it("attaches zone labels by point-in-polygon", () => {
    expect(normalized!.geometry.zones).toHaveLength(1);
    expect(normalized!.geometry.zones[0].label).toBe("ALMACEN");
  });

  it("normalizes port rotation to [0,360) and assigns fallback labels", () => {
    const ports = normalized!.geometry.ports;
    expect(ports).toEqual([
      { kind: "in", x: 0, y: 15, direction_deg: 0, label: "IN-1" },
      { kind: "out", x: 100, y: 45, direction_deg: 270, label: "OUT-1" },
    ]);
  });

  it("translates every collection with the same offset", () => {
    expect(normalized!.geometry.walls[0].vertices[0]).toEqual({ x: 0, y: 30 });
    expect(normalized!.geometry.routes[0].vertices[0]).toEqual({ x: 5, y: 2 });
    expect(normalized!.geometry.columns).toEqual([
      { kind: "circle", center: { x: 20, y: 20 }, radius_m: 0.3 },
    ]);
  });

  it("returns null when there is no single closed outline", () => {
    const ex = parseDxf(
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
    );
    expect(normalizeLayout(ex)).toBeNull();
  });

  it("numbers fallback labels per kind in draw order", () => {
    const ex = parseDxf(
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
        insert("EBI_PORT_IN", "EBI-PORT", 0, 10, 0),
        insert("EBI_PORT_OUT", "EBI-PORT", 100, 20, 180),
        insert("EBI_PORT_IN", "EBI-PORT", 0, 30, 0),
      ]),
    );
    const labels = normalizeLayout(ex)!.geometry.ports.map((p) => p.label);
    expect(labels).toEqual(["IN-1", "OUT-1", "IN-2"]);
  });
});

describe("normalizeFootprint", () => {
  it("normalizes a machine top view to local (0,0) with width/depth", () => {
    const ex = parseDxf(
      dxfFile([
        lwpolyline(
          "EBI-OUTLINE",
          [
            [10, 5],
            [12.5, 5],
            [12.5, 8.2],
            [10, 8.2],
          ],
          true,
        ),
        insert("EBI_PORT_IN", "EBI-PORT", 10, 6, 180),
      ]),
    );
    const fp = normalizeFootprint(ex);
    expect(fp).not.toBeNull();
    expect(fp!.width_m).toBe(2.5);
    expect(fp!.depth_m).toBe(3.2);
    expect(fp!.outline[0]).toEqual({ x: 0, y: 0 });
    expect(fp!.ports).toEqual([
      { kind: "in", x: 0, y: 1, direction_deg: 180, label: "IN-1" },
    ]);
  });
});
