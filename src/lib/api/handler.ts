import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { authErrorResponse, parseJsonBody } from "@/lib/auth/api";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Canonical positive-integer id parser. Replaces the ~17 copy-pasted
 * `parseId` definitions (and their inline `Number(...)` variants) across
 * `src/app/api/**` route handlers.
 */
export function parseId(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
export const unprocessable = (error: string) => NextResponse.json({ error }, { status: 422 });
export const notFound = (error: string) => NextResponse.json({ error }, { status: 404 });
export const conflict = (error: string) => NextResponse.json({ error }, { status: 409 });
export const created = (body: unknown) => NextResponse.json(body, { status: 201 });

/**
 * Parses the JSON body of a request. Returns the malformed-body 400 response
 * directly (instead of throwing) so callers do `if (body instanceof
 * NextResponse) return body;` in place of the try/catch every handler used to
 * repeat. `parseJsonBody` (`@/lib/auth/api`) stays as the primitive — it's
 * shared with non-route callers and forces `unknown`, which this wraps.
 *
 * Pass a zod schema (one per resource, in `src/modules/<m>/schemas.ts`) to
 * get a typed, validated body instead of hand-declaring `{ field?: unknown }`
 * and validating each field imperatively; a failed `safeParse` becomes a 422
 * with the first issue's message.
 */
export async function parseBody<T>(request: NextRequest, schema?: ZodType<T>): Promise<T | NextResponse> {
  let json: unknown;
  try {
    json = await parseJsonBody(request);
  } catch {
    return badRequest("Cuerpo inválido.");
  }
  if (!schema) return json as T;
  const result = schema.safeParse(json);
  if (!result.success) {
    return unprocessable(result.error.issues[0]?.message ?? "Datos inválidos.");
  }
  return result.data;
}

export interface UniqueRule {
  /** Tested against `err.message`. Checked in order, before `uniqueFallback`. */
  pattern: RegExp;
  message: string;
}

export interface HandleRouteOptions {
  /** Auth/permission guard, e.g. `() => requirePermission("production.cell:update")`. */
  guard: () => Promise<SessionUser>;
  /** Constraint-specific 409 messages (e.g. `UQ_cell_parent_sequence`), tried before `uniqueFallback`. */
  uniqueRules?: UniqueRule[];
  /** Message for a generic `unique` constraint violation not matched by `uniqueRules`. */
  uniqueFallback?: string;
  /** Logged with the caught error and returned as the 500 body when nothing else matches. */
  fail: string;
  /** `METHOD /api/...` label used in the `console.error` line. */
  label: string;
}

/**
 * Centralizes the guard -> business logic -> error-mapping envelope repeated
 * in every route handler: RBAC errors (`requirePermission`/`requireAnyRole`)
 * map to 401/403, `unique`/`UQ_*` constraint violations map to 409, anything
 * else is logged and mapped to 500.
 *
 * Id parsing and body validation stay in the caller, called *before*
 * `handleRoute` — they vary too much per handler to generalize, and today's
 * handlers validate input before running the permission check, not after;
 * keeping that ordering here preserves identical behavior during migration.
 */
export async function handleRoute(
  opts: HandleRouteOptions,
  run: (user: SessionUser) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const user = await opts.guard();
    return await run(user);
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    const msg = err instanceof Error ? err.message : "";
    for (const rule of opts.uniqueRules ?? []) {
      if (rule.pattern.test(msg)) return conflict(rule.message);
    }
    if (opts.uniqueFallback && /unique/i.test(msg)) return conflict(opts.uniqueFallback);
    console.error(`${opts.label} failed:`, err);
    return NextResponse.json({ error: opts.fail }, { status: 500 });
  }
}
