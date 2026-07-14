import { describe, it, expect } from "vitest";
import {
  createProgramSchema,
  updateProgramSchema,
  reorderEntriesSchema,
  linkStationSchema,
  parseProgramDate,
} from "@/modules/planning/schemas";

describe("parseProgramDate", () => {
  it("parses YYYY-MM-DD to UTC midnight", () => {
    const d = parseProgramDate("2026-07-14");
    expect(d.toISOString()).toBe("2026-07-14T00:00:00.000Z");
  });
});

describe("createProgramSchema", () => {
  it("accepts a valid cell/date and defaults shift to null", () => {
    const r = createProgramSchema.parse({ cell_id: 5, program_date: "2026-07-14" });
    expect(r).toEqual({ cell_id: 5, program_date: "2026-07-14", shift: null });
  });

  it("rejects a malformed date", () => {
    expect(createProgramSchema.safeParse({ cell_id: 5, program_date: "14/07/2026" }).success).toBe(false);
  });

  it("rejects a shift outside 1–3", () => {
    expect(createProgramSchema.safeParse({ cell_id: 5, program_date: "2026-07-14", shift: 4 }).success).toBe(false);
  });

  it("rejects a non-positive cell id", () => {
    expect(createProgramSchema.safeParse({ cell_id: 0, program_date: "2026-07-14" }).success).toBe(false);
  });
});

describe("updateProgramSchema", () => {
  it("requires at least one field", () => {
    expect(updateProgramSchema.safeParse({}).success).toBe(false);
  });

  it("trims notes and only allows publishing as a status transition", () => {
    expect(updateProgramSchema.parse({ notes: "  hola  " })).toEqual({ notes: "hola" });
    expect(updateProgramSchema.parse({ status: "published" }).status).toBe("published");
    expect(updateProgramSchema.safeParse({ status: "archived" }).success).toBe(false);
  });
});

describe("reorderEntriesSchema", () => {
  it("requires a non-empty list of positive ids", () => {
    expect(reorderEntriesSchema.parse({ ordered_nesting_ids: [3, 1, 2] }).ordered_nesting_ids).toEqual([3, 1, 2]);
    expect(reorderEntriesSchema.safeParse({ ordered_nesting_ids: [] }).success).toBe(false);
    expect(reorderEntriesSchema.safeParse({ ordered_nesting_ids: [1, -2] }).success).toBe(false);
  });
});

describe("linkStationSchema", () => {
  it("requires both a cell and a station", () => {
    expect(linkStationSchema.parse({ cell_id: 2, eps_station_id: 7 })).toEqual({ cell_id: 2, eps_station_id: 7 });
    expect(linkStationSchema.safeParse({ cell_id: 2 }).success).toBe(false);
  });
});
