import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// `@/lib/auth/rbac` pulls in `@/auth` (NextAuth) purely for its error classes;
// stub it so this stays a fast, DB-free unit test of the handler envelope.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { UnauthenticatedError, ForbiddenError, type SessionUser } from "@/lib/auth/rbac";
import { parseId, handleRoute, conflict, notFound } from "../handler";

const user: SessionUser = { id: 1, name: "Test", username: "test", roles: ["admin"] };

describe("parseId", () => {
  it("accepts positive integer strings", () => {
    expect(parseId("42")).toBe(42);
  });

  it("rejects zero, negative, decimal, non-numeric and missing values", () => {
    expect(parseId("0")).toBeNull();
    expect(parseId("-3")).toBeNull();
    expect(parseId("1.5")).toBeNull();
    expect(parseId("abc")).toBeNull();
    expect(parseId(undefined)).toBeNull();
    expect(parseId(null)).toBeNull();
  });
});

describe("handleRoute", () => {
  it("runs the handler and returns its response when the guard passes", async () => {
    const res = await handleRoute(
      { guard: async () => user, fail: "boom", label: "GET /api/test" },
      async (u) => NextResponse.json({ id: u.id }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1 });
  });

  it("maps UnauthenticatedError to 401", async () => {
    const res = await handleRoute(
      {
        guard: async () => {
          throw new UnauthenticatedError();
        },
        fail: "boom",
        label: "GET /api/test",
      },
      async () => NextResponse.json({}),
    );
    expect(res.status).toBe(401);
  });

  it("maps ForbiddenError to 403", async () => {
    const res = await handleRoute(
      {
        guard: async () => {
          throw new ForbiddenError();
        },
        fail: "boom",
        label: "GET /api/test",
      },
      async () => NextResponse.json({}),
    );
    expect(res.status).toBe(403);
  });

  it("maps a matching uniqueRule to 409 with its message", async () => {
    const res = await handleRoute(
      {
        guard: async () => user,
        uniqueRules: [{ pattern: /UQ_cell_parent_sequence/i, message: "Secuencia duplicada." }],
        fail: "boom",
        label: "PATCH /api/test",
      },
      async () => {
        throw new Error("UQ_cell_parent_sequence violated");
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Secuencia duplicada." });
  });

  it("falls back to uniqueFallback on a generic unique violation", async () => {
    const res = await handleRoute(
      {
        guard: async () => user,
        uniqueRules: [{ pattern: /UQ_cell_parent_sequence/i, message: "Secuencia duplicada." }],
        uniqueFallback: "El código ya existe.",
        fail: "boom",
        label: "PATCH /api/test",
      },
      async () => {
        throw new Error("Violation of UNIQUE KEY constraint");
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "El código ya existe." });
  });

  it("maps any other error to a logged 500 with the fail message", async () => {
    const res = await handleRoute(
      { guard: async () => user, fail: "No se pudo procesar.", label: "PATCH /api/test" },
      async () => {
        throw new Error("something unexpected");
      },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No se pudo procesar." });
  });
});

describe("response helpers", () => {
  it("conflict returns 409 with the given message", async () => {
    const res = conflict("ya existe");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ya existe" });
  });

  it("notFound returns 404 with the given message", async () => {
    const res = notFound("no encontrado");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no encontrado" });
  });
});
