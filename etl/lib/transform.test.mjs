import { describe, it, expect } from "vitest";
import { SCOPE, canon, rowHash, buildMergeSql, maxWatermark } from "./transform.mjs";

describe("SCOPE", () => {
  it("pins v1 to Plant 1 / route 9", () => {
    expect(SCOPE.plantId).toBe(1);
    expect(SCOPE.routeId).toBe(9);
    expect(SCOPE.closureLookbackDays).toBeGreaterThan(0);
  });
});

describe("canon", () => {
  it("is deterministic and stable across value types", () => {
    expect(canon(null)).toBe(canon(undefined));
    expect(canon(true)).toBe("1");
    expect(canon(false)).toBe("0");
    expect(canon(42)).toBe("42");
    expect(canon(new Date("2026-07-14T10:00:00.000Z"))).toBe("2026-07-14T10:00:00.000Z");
  });
});

describe("rowHash", () => {
  it("returns a 64-char lowercase hex digest", () => {
    const h = rowHash([1, "a", null, new Date("2026-01-01T00:00:00Z")]);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for equal inputs and sensitive to any change", () => {
    const base = [1, "PROG-A", 12.5, false];
    expect(rowHash(base)).toBe(rowHash([1, "PROG-A", 12.5, false]));
    expect(rowHash(base)).not.toBe(rowHash([1, "PROG-A", 12.6, false]));
    expect(rowHash(base)).not.toBe(rowHash([1, "PROG-A", 12.5, true]));
  });

  it("does not collide when adjacent fields shift (uses a separator)", () => {
    // Without a field separator ["a","b"] and ["ab",""] would collide.
    expect(rowHash(["a", "b"])).not.toBe(rowHash(["ab", ""]));
  });
});

describe("maxWatermark", () => {
  it("returns the highest id as a string, or null when empty", () => {
    expect(maxWatermark([{ id: 3 }, { id: 9 }, { id: 5 }], "id")).toBe("9");
    expect(maxWatermark([], "id")).toBeNull();
  });
});

describe("buildMergeSql", () => {
  const hashedSpec = {
    schema: "staging",
    table: "eps_nesting",
    keys: ["eps_nesting_id"],
    hash: true,
    cols: [
      { name: "eps_nesting_id", sql: "INT" },
      { name: "program_name", sql: "NVARCHAR(35)" },
      { name: "cut_minutes", sql: "DECIMAL(12,2)" },
    ],
  };

  it("emits an OPENJSON-driven MERGE with a hash-skip guard", () => {
    const sql = buildMergeSql(hashedSpec);
    expect(sql).toContain("MERGE staging.eps_nesting WITH (HOLDLOCK) AS t");
    expect(sql).toContain("OPENJSON(@json) WITH (");
    expect(sql).toContain("row_hash CHAR(64) '$.row_hash'");
    expect(sql).toContain("t.row_hash IS NULL OR t.row_hash <> CONVERT(VARBINARY(32), s.row_hash, 2)");
    expect(sql).toContain("ON t.eps_nesting_id = s.eps_nesting_id");
    expect(sql).toContain("SELECT @@ROWCOUNT AS affected;");
  });

  it("does not set key columns in the UPDATE clause", () => {
    const sql = buildMergeSql(hashedSpec);
    const setClause = sql.slice(sql.indexOf("UPDATE SET"));
    expect(setClause).not.toContain("t.eps_nesting_id ="); // key belongs only to ON
    expect(setClause).toContain("t.program_name = s.program_name");
    expect(setClause).toContain("t.cut_minutes = s.cut_minutes");
  });

  it("omits the hash guard and row_hash for non-hashed tables (composite key)", () => {
    const sql = buildMergeSql({
      schema: "staging",
      table: "eps_cutting_station",
      keys: ["eps_plant_id", "eps_route_id", "eps_station_id"],
      hash: false,
      cols: [
        { name: "eps_plant_id", sql: "INT" },
        { name: "eps_route_id", sql: "INT" },
        { name: "eps_station_id", sql: "INT" },
        { name: "description", sql: "NVARCHAR(60)" },
      ],
    });
    expect(sql).not.toContain("row_hash");
    expect(sql).toContain(
      "ON t.eps_plant_id = s.eps_plant_id AND t.eps_route_id = s.eps_route_id AND t.eps_station_id = s.eps_station_id",
    );
    expect(sql).toContain("t.description = s.description");
    // WHEN MATCHED has no extra guard for non-hashed tables.
    expect(sql).toContain("WHEN MATCHED THEN UPDATE SET");
  });
});
