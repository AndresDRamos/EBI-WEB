---
id: production-db-unify
status: committed
created: 2026-07-09
touches: [production, maintenance, org, navigation]
migrations: []
supersedes: null
superseded_by: null
---

# Unificar capa de datos de producción

## Objective

`src/modules/production/db.ts` (cells + assignments) and the `production/db/`
folder (layout/footprint/placement) grew side by side as two conventions in
the same module, and along the way duplicated cross-schema plumbing that
`maintenance` and `org` had already solved independently: `emptyToNull` in 4
places, `withSchema(...)` client bindings redeclared per module,
`assetRefsById` in two divergent shapes, `locationRefsById`/`processNamesById`
duplicated near-verbatim, and three different code paths for resolving a
cell's name from an assignment. Consolidate all of it into a single
domain-blind infra layer and a single module-layout convention, with zero
behavior change and zero schema changes.

## Steps

1. `src/lib/db/schema-clients.ts` — single home for the four per-schema
   Kysely clients (`authDb`, `orgDb`, `maintDb`, `productionDb`) and
   `emptyToNull`; every module that used to call `rootDb.withSchema(...)`
   locally now imports from here instead.
2. `src/lib/db/refs.ts` — single home for the cross-schema ref lookups
   shared by `maintenance` and `production`: `locationRefsById` (full shape:
   code + plant code/name), `processNamesById`, `assetRefsById` (full shape
   with `has_image`, replacing the 2-field copy in `production/db/shared.ts`).
3. `src/modules/production/db.ts` split into `db/cell.ts` + `db/assignment.ts`
   (mirrors the `org` module's one-file-per-aggregate convention already used
   for `layout.ts`/`footprint.ts`/`placement.ts`); `db/index.ts` barrel keeps
   `@/modules/production/db` resolving so no call site changes.
4. Cell-name resolution (`withCellRefs`, `currentCellNamesByAssets`, and the
   assignment↔cell join) consolidated into one shared query builder in
   `assignment.ts` (`baseAssignmentWithCellQuery`) feeding
   `listCurrentByAsset`, `listHistoryByAsset` and `currentCellNamesByAssets`
   — one join, no second query per list.
5. `OperativeCellRow` (previously hand-declared in the client component
   `location-cells-modal.tsx`) is now `Pick<CellListRow, ...>` exported from
   `db/cell.ts`, with a `toOperativeCellRow` serializer used by the RSC page;
   the client component imports the type instead of re-declaring it.

## Database impact

None — pure TypeScript query-layer refactor, no schema changes, no
migrations.

## Amendments

- 2026-07-09 — Widened step 1's scope from "production only" (as originally
  scoped) to every module with a local `withSchema(...)`/`emptyToNull`
  (navigation, org/locations, org/org, org/permissions, org/plant-process,
  org/users, maintenance) to satisfy the acceptance bullet literally ("grep
  `withSchema(` only in the single home"). Mechanical, same runtime binding,
  covered by the same lint/build/smoke pass. Objective still accurate.
