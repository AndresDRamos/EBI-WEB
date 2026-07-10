import { describe, expect, it } from "vitest";
import { createDepartmentSchema } from "../schemas";

describe("createDepartmentSchema", () => {
  it("rejects a missing name", () => {
    const res = createDepartmentSchema.safeParse({});
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("El nombre es obligatorio.");
  });

  it("rejects a blank name", () => {
    const res = createDepartmentSchema.safeParse({ name: "   " });
    expect(res.success).toBe(false);
  });

  it("trims the name and normalizes a blank description to null", () => {
    const res = createDepartmentSchema.safeParse({ name: "  Calidad  ", description: "   " });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.name).toBe("Calidad");
      expect(res.data.description).toBeNull();
    }
  });

  it("keeps a trimmed description", () => {
    const res = createDepartmentSchema.safeParse({ name: "Calidad", description: "  Control de calidad  " });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.description).toBe("Control de calidad");
  });
});
