/**
 * Pure helpers for the admin DataTable. No `src/lib/db` dependency, no I/O.
 * Kept in `src/lib/admin/` (not `src/lib/db/`) so the data-layer rule holds:
 * only `src/lib/db/` may touch SQL. These are pure utilities.
 */

/**
 * Normalize a string for diacritics + case-insensitive comparison.
 * `NFD` separates accents, the regex strips combining marks, then lowercase +
 * collapse internal whitespace. Approximate substring matching for es-MX.
 */
export function normalizeForMatch(value: unknown): string {
  if (value == null) return "";
  const s = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return s.replace(/\s+/g, " ");
}

/** True if `haystack` contains `needle` (case + diacritics-insensitive). */
export function fuzzyIncludes(haystack: unknown, needle: unknown): boolean {
  const h = normalizeForMatch(haystack);
  const n = normalizeForMatch(needle);
  if (!n) return true; // empty filter == matches all
  return h.includes(n);
}

/**
 * Build a comparator from a key + direction for the sort cycle.
 * `numeric` compares raw numbers; `string` uses `localeCompare("es")` and
 * diacritics-insensitivity; arrays are compared by their joined (normalized)
 * value so multi-value cells sort predictably.
 */
export type SortDir = "asc" | "desc" | null;

export interface ComparatorAccessor<T> {
  (row: T): string | number | string[];
}

export function makeComparator<T>(
  accessor: ComparatorAccessor<T>,
  dir: Exclude<SortDir, null>,
): (a: T, b: T) => number {
  const polarity = dir === "asc" ? 1 : -1;
  return (a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (typeof av === "number" && typeof bv === "number") {
      if (av === bv) return 0;
      return (av - bv) * polarity;
    }
    const as = Array.isArray(av) ? av.map((x) => x).join(" / ") : String(av ?? "");
    const bs = Array.isArray(bv) ? bv.map((x) => x).join(" / ") : String(bv ?? "");
    return as.localeCompare(bs, "es", { sensitivity: "base" }) * polarity;
  };
}

/**
 * Catalog multi-select predicate: row passes if its accessor (string OR any
 * element of a `string[]`) intersects the selected multi-set.
 */
export function intersectsCatalog(
  accessor: string | string[],
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const vals = Array.isArray(accessor) ? accessor : [accessor];
  return selected.some((s) => vals.includes(s));
}

/** Stable slice the page. */
export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  if (start < 0 || start >= rows.length) return [];
  return rows.slice(start, start + pageSize);
}