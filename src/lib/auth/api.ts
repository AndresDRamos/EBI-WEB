import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";

/**
 * Maps RBAC errors raised by `requireUser` / `requireAnyRole` into the
 * appropriate HTTP response. Returns `null` when the error is not an RBAC
 * error (re-throw upstream).
 */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "Prohibido." }, { status: 403 });
  }
  return null;
}

/** Parse a JSON request body (throws on invalid JSON). */
export async function parseJsonBody(request: NextRequest): Promise<unknown> {
  return request.json();
}