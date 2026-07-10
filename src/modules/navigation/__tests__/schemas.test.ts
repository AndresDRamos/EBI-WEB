import { describe, expect, it } from "vitest";
import { roleGrantsSchema } from "../schemas";

describe("roleGrantsSchema", () => {
  it("rejects a body without a grants array", () => {
    expect(roleGrantsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-array grants field", () => {
    expect(roleGrantsSchema.safeParse({ grants: "nope" }).success).toBe(false);
  });

  it("rejects a non-positive item_id", () => {
    const res = roleGrantsSchema.safeParse({ grants: [{ item_id: 0, priority: 1 }] });
    expect(res.success).toBe(false);
  });

  it("rejects a non-integer priority", () => {
    const res = roleGrantsSchema.safeParse({ grants: [{ item_id: 1, priority: 1.5 }] });
    expect(res.success).toBe(false);
  });

  it("accepts a valid grants list, coercing numeric strings", () => {
    const res = roleGrantsSchema.safeParse({ grants: [{ item_id: "3", priority: "0" }] });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.grants).toEqual([{ item_id: 3, priority: 0 }]);
  });
});
