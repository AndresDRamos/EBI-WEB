# production

**Last synced:** 2026-07-06 · **Synced from:** plan production-cell-assignment (branch `feat/production-cell-assignment`, V11) + plan production-schema-rename (branch `chore/production-schema-rename`, V12: schema `produccion` → `production`, structure unchanged)

## Purpose

Production-structure module of the EBI portal. Separates the physical asset
(`maint.asset`, owned by maintenance) from the logical production structure —
line → cell — with a **temporal, historized M:N assignment** between assets and
cells (`production.asset_cell_assignment`). It replaces the free-text
`maint.asset.location` as the source of truth for where an asset works (the
free-text column still exists until a future decision), and is the structural
base for future planning/APS work. V11 also added `maint.asset.asset_category`
(`production_equipment` | `material_handling`): material-handling equipment
shares the maintenance catalog but typically floats as shared plant capacity,
so cell assignments stay optional for it.

## Responsibilities

- Owns the module slice `src/modules/production/` — `db.ts` is the only place
  that queries `production.*` tables (client bound with
  `withSchema("production")` since V12 renamed the schema from `produccion`);
  `components/` holds the module UI; `enums.ts`
  is the **canonical** home of `ASSET_CATEGORIES` /
  `ASSET_CATEGORY_LABELS` / `assetCategoryLabel` (V11 introduced the CHECK),
  re-exported by `src/modules/maintenance/enums.ts`.
- Owns `/api/production/**`: `lines[/[id]]`, `cells[/[id]]`,
  `cells/[id]/assignments`, `assignments/[id]/close`,
  `assignments/[id]/reassign`. Reads require any authenticated user
  (`requireUser`); each mutation is gated by
  `requirePermission("production.<resource>:<action>")` (codes seeded in V11;
  `reassign` requires **both** `production.assignment:close` and
  `production.assignment:create` since it closes and creates). Missing `[id]`
  → 404; unique-index violations and closing an already-closed assignment →
  409; validation failures → 422.
- Owns the `(portal)/production/*` UI: `/production` redirects to the cell
  catalog; `Líneas` and `Celdas` list pages (generic `DataTable`, action
  visibility via `useCan`); cell detail = current composition + closed history
  with the assign / reassign / close actions. The segment `layout.tsx` gates
  the tree with `requireSectionOrRedirect("production")` (ADR 0005). The
  section is **dark-launched**: V11 seeds it with `is_active = 0`.
- Owns the temporal-assignment invariant: `reassign` in `db.ts` is the only
  sanctioned "move" (close + insert in one transaction);
  `closeAssignment` only touches rows still current (returns `false` for an
  already-closed row → API 409).
- Does **not** own assets (`maint.asset`, module maintenance) — assignments
  reference them and `db.ts` reads `maint.asset` code/name for display only.
  Does not own plants (module org, `auth.plant`). Does not own the read-only
  Ubicación tab on the machine detail — that UI lives in maintenance and
  consumes this module's `db.ts`; all assignment *actions* live in the cell
  detail here.

## Dependency flow

- `(portal)/production/*` pages → `src/modules/production/db.ts` +
  `src/modules/org/db/org.ts` (plant options) + `src/modules/maintenance/db.ts`
  (`listAssets` for the assign picker in the cell detail — app-layer
  composition, allowed by the blueprint).
- `/api/production/**` → `modules/production/db.ts`; the assignment-create
  route also calls `maintenance/db.findAssetById` to validate the asset (422).
- `modules/production/db.ts` → `production.*` via the schema-bound client;
  cross-schema lookups (`auth.plant` names, `maint.asset` code/name) run as
  separate per-schema queries merged in JS (typed cross-schema joins are not
  expressible with the flattened codegen keys — same pattern as maintenance).
- Module-code direction with maintenance is **one-way, maintenance →
  production**: `maintenance/enums.ts` re-exports the asset-category domain
  from `production/enums.ts`, and the maintenance machine-detail page reads
  `listHistoryByAsset` from `production/db.ts`. Nothing in
  `src/modules/production/` imports from `src/modules/maintenance/` (only app
  routes compose both).

## Related ADRs

- [ADR 0004 — Role as access profile](../architecture/adr/0004-role-as-access-profile.md) (admin bypass; no `role_permission` seeds)
- [ADR 0005 — Section grants authorize pages](../architecture/adr/0005-section-grants-authorize-pages.md) (segment guard)

## Do not touch without reading

- **Never UPDATE `asset_id`/`cell_id` in place on
  `production.asset_cell_assignment`.** A reassignment is close (`valid_to`) +
  insert, in one transaction (`reassign` in `db.ts`). The table has **no
  `updated_at` on purpose** — do not add one; it would invite exactly the
  in-place rewrite the design prevents.
- **The filtered unique index `UQ_asset_cell_assignment_current`
  (`asset_id, cell_id WHERE valid_to IS NULL`) permits real current M:N.** It
  only blocks a duplicate *current* row per pair. Do not "tighten" it to one
  cell per asset: a shared asset (feed tower) legitimately serves several
  cells at once.
- **`src/modules/production/enums.ts` must stay a pure module** (no
  `server-only`, no I/O): it is imported by client components, API validation
  **and by `maintenance/enums.ts`**. Moving or renaming its exports breaks the
  maintenance module too.
- **Nav-cache gotcha after migrations that seed nav rows:** the V11-seeded
  `production` section/items do **not** invalidate the persisted
  `unstable_cache` tagged `"nav"` (`src/modules/navigation/cache.ts`) —
  `revalidateTag("nav")` only fires from `/api/nav/*` and role mutations.
  After applying such a migration, trigger any `/api/nav/*` mutation (or
  restart with a cold cache), or `requireSectionOrRedirect("production")`
  keeps redirecting **even for admins**.
- **`cell.sequence_in_line` requires `line_id`** (`CK_cell_sequence_requires_line`);
  `db.ts` normalizes (clears the sequence when the line is cleared) so the API
  422 is the only user-facing gate — keep that normalization if you touch
  `createCell`/`updateCell`, or writes start failing with 547.
