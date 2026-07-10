import { describe, expect, it } from "vitest";
import { updateCellSchema } from "../schemas";

describe("updateCellSchema", () => {
  it("rejects an empty body (no changes)", () => {
    const res = updateCellSchema.safeParse({});
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("Sin cambios.");
  });

  it("omits a blank/whitespace name instead of erroring", () => {
    const res = updateCellSchema.safeParse({ name: "   ", is_active: true });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.name).toBeUndefined();
  });

  it("trims a valid name", () => {
    const res = updateCellSchema.safeParse({ name: "  Celda A  " });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.name).toBe("Celda A");
  });

  it("accepts parent_cell_id: null to clear it", () => {
    const res = updateCellSchema.safeParse({ parent_cell_id: null });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.parent_cell_id).toBeNull();
  });

  it("rejects a non-positive parent_cell_id", () => {
    const res = updateCellSchema.safeParse({ parent_cell_id: 0 });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("Celda padre inválida.");
  });

  it("rejects a zero size_x_m", () => {
    const res = updateCellSchema.safeParse({ size_x_m: 0 });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("El tamaño X debe ser mayor a cero.");
  });

  it("accepts size_x_m: '' as clearing the value", () => {
    const res = updateCellSchema.safeParse({ size_x_m: "" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.size_x_m).toBeNull();
  });

  it("rejects an invalid process_id", () => {
    const res = updateCellSchema.safeParse({ process_id: -1 });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("Proceso inválido.");
  });

  it("accepts a full valid patch", () => {
    const res = updateCellSchema.safeParse({
      name: "Celda B",
      parent_cell_id: 5,
      size_x_m: 2.5,
      size_y_m: 3,
      process_id: 7,
      is_active: false,
    });
    expect(res.success).toBe(true);
  });
});
