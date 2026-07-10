import { afterEach, describe, expect, it, vi } from "vitest";
import { apiMutate, ApiError } from "../api-client";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("apiMutate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed JSON body on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { ok: true })));
    const result = await apiMutate("/api/x");
    expect(result).toEqual({ ok: true });
  });

  it("sends a JSON body and Content-Type header when body is provided", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { id: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiMutate("/api/x", { method: "POST", body: { name: "a" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "a" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("throws an ApiError with the server's message on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, { error: "Ya existe." })));
    await expect(apiMutate("/api/x")).rejects.toThrow(new ApiError("Ya existe."));
  });

  it("falls back to `fallback` when the error response has no body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(apiMutate("/api/x", { fallback: "No se pudo guardar." })).rejects.toThrow(
      "No se pudo guardar.",
    );
  });

  it("returns undefined for a 204 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const result = await apiMutate("/api/x", { method: "DELETE" });
    expect(result).toBeUndefined();
  });
});
