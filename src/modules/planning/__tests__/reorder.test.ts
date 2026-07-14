import { describe, it, expect } from "vitest";
import { reorderPasses } from "@/modules/planning/db/program";

describe("reorderPasses", () => {
  it("assigns final sequences as (i+1)*10 in the given order", () => {
    const { final } = reorderPasses([30, 10, 20]);
    expect(final).toEqual([
      { id: 30, seq: 10 },
      { id: 10, seq: 20 },
      { id: 20, seq: 30 },
    ]);
  });

  it("uses a positive temp offset (never <= 0, honoring the CHECK) that is unique", () => {
    const ids = [5, 6, 7, 8];
    const { temp } = reorderPasses(ids);
    for (const t of temp) expect(t.seq).toBeGreaterThan(0);
    const seqs = temp.map((t) => t.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    // Temp values sit far above any realistic (i+1)*10 sequence, so the
    // first pass cannot collide with the second pass's target range.
    expect(Math.min(...seqs)).toBeGreaterThan(ids.length * 10);
  });

  it("handles the empty and single-entry cases", () => {
    expect(reorderPasses([])).toEqual({ temp: [], final: [] });
    expect(reorderPasses([42])).toEqual({
      temp: [{ id: 42, seq: 1_000_000 }],
      final: [{ id: 42, seq: 10 }],
    });
  });
});
