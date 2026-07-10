/**
 * Client-side fetch wrapper for mutating API routes. Replaces the
 * `(await res.json().catch(() => ({}))) as { error?: string }` +
 * `throw new Error(...)` literal that was copy-pasted 44 times across 19
 * client components.
 *
 * Convention: throw a typed `ApiError` on a non-OK response (its `.message`
 * is the server's `{ error }` string, or `fallback`). Callers that need a
 * `{ error?: string }` result instead of a throw (e.g. `DataTable`'s
 * onSoftDelete/onHardDelete/onRestore) catch it locally — see
 * `src/components/kit/data-table.tsx`.
 */
export class ApiError extends Error {}

export interface ApiMutateOptions {
  method?: string;
  body?: unknown;
  /** Used when the response has no `{ error }` body of its own. */
  fallback?: string;
}

export async function apiMutate<T = unknown>(
  url: string,
  options: ApiMutateOptions = {},
): Promise<T> {
  const hasBody = options.body !== undefined;
  const res = await fetch(url, {
    method: options.method ?? "POST",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? options.fallback ?? "Ocurrió un error.");
  }
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => undefined)) as T;
}
