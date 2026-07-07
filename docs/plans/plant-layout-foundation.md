---
id: plant-layout-foundation
status: committed
created: 2026-07-06
touches: [docs/modules/production.md, docs/architecture/cad-layout-contract.md]
migrations: [V13, V14]
supersedes: null
superseded_by: null
---

# Plant layout digitization — foundation

## Objective

Digitize plant floor layouts as versioned, immutable canvases in the portal: an
in-portal DXF importer (CAD contract: `EBI-*` layers) with a validation report
and rendered preview; per-asset top-view **footprints** (small DXF or W×D
rectangle quick-create); and a **temporal, historized physical placement** of
assets on the active layout (drag & drop, snap, rotate) — the same
close-+ -insert invariant family as `production.asset_cell_assignment`.
Foundation for future material-flow routing over `EBI-ROUTE` centerlines
(explicitly out of scope; the data model must not preclude it).

Grounded in the verified analysis of plant 7's real file (`SF - Nave piso.dxf`,
2026-07-06): header falsely declares millimeters while geometry is in meters
(validator must sanity-check units against extents), ANSI codepage with
accented layer names (decode before parse), zero closed polylines today (the
team traces `EBI-*` layers in CAD per the contract), attribute-less blocks
(ports = `EBI_PORT_IN`/`EBI_PORT_OUT` block names + INSERT rotation, ATTRIB
label optional).

## Decisions (approved 2026-07-06)

- **Placements carry forward:** confirming a new layout version closes the
  outgoing version's open placements AND opens identical rows on the new
  version (one transaction). Re-placement from scratch was rejected.
- **Dedicated blob container, name as a code constant (user decision
  2026-07-06):** container names are NOT env vars — `maintenance` and
  `production` are constants in `src/lib/storage/blob.ts`; the only secret/env
  input is `AZURE_STORAGE_CONNECTION_STRING` (per-environment separation =
  different connection string). The `AZURE_STORAGE_CONTAINER_MAINT` env var is
  removed in the blob.ts refactor. Keys: `layouts/{plant_id}/...`,
  `footprints/{asset_id}/...`. **Infrastructure provisioned and verified
  2026-07-06:** account `ezistorage`, private containers `maintenance` +
  `production`, upload/read/delete round-trip OK on both.
- Ports contract avoids the `dxf-parser` ATTRIB weakness: direction from block
  name (`EBI_PORT_IN`/`EBI_PORT_OUT`) + INSERT rotation; label ATTRIB optional.
- Normalizer auto-translates the OUTLINE minimum to (0,0) and reports it.
- Units plausibility: 10–1000 m per side (constant in `dxf/contract.ts`).
- Strict immutability: any geometry correction = new draft → confirm cycle.

## Steps

1. **Spike (gate for everything else):** run `dxf-parser` against plant 7's
   real DXF in a scratch script — verify decoded layer names (windows-1252),
   LWPOLYLINE closed flags, INSERT points/rotations, header vars. If ATTRIB
   values are unreadable, confirm the block-name fallback suffices (it should —
   the contract was designed for it).
2. **CAD contract:** write `docs/architecture/cad-layout-contract.md` (layers
   `EBI-OUTLINE|WALL|COLUMN|AISLE|ROUTE|ZONE|PORT`, `EBI_PORT_IN/OUT` blocks,
   meters, origin, closed-polyline rules, ASCII layer names, export recipe
   AUDIT+PURGE+DXF 2018) + ADR "DXF as source, normalized JSON as portal truth".
3. **Pure DXF pipeline** `src/modules/production/dxf/` (`decode.ts`,
   `parse.ts`, `normalize.ts`, `validate.ts`, `geometry.ts`, `contract.ts`,
   `index.ts` = `runImport(bytes)`), unit tests per stage (fixtures: minimal
   hand-written DXF strings + plant 7 excerpts). New dep: `dxf-parser` only.
4. **Generalize `src/lib/storage/blob.ts`:** container as a parameter with the
   names as exported constants (`maintenance`, `production`) — drop the
   `AZURE_STORAGE_CONTAINER_MAINT` env var (only
   `AZURE_STORAGE_CONNECTION_STRING` remains); maintenance call-site behavior
   unchanged (verify with `pnpm build`).
5. **Data layer** `src/modules/production/db/{layout,footprint,placement}.ts`
   binding `withSchema("production")`; existing `db.ts` untouched (exports
   consumed by maintenance stay stable). `activateDraft` = one transaction:
   archive previous active + activate draft + close outgoing open placements +
   re-open them on the new version (carry-forward). `movePose` = close+insert
   (the `reassign` analogue). App validates `maint.asset.plant_id` =
   layout's `plant_id` on placement create.
6. **Layouts API** (`/api/production/layouts/**` per the route table in the
   executor prompt): multipart import (cap 50 MB → 413, Node runtime, buffered)
   → blob-first archive → draft row with geometry + report; confirm; discard
   draft (409 if active); list/get (exclude `geometry` LOB from list queries).
7. **Import wizard UI** (`layout-import-wizard.tsx`, `validation-report-view.tsx`)
   + route `(portal)/production/layout/import`.
8. **Viewer** (`layout-canvas.tsx` SVG, custom pan/zoom ~100 lines, no d3) +
   `(portal)/production/layout` (active version; empty state when none).
9. **Footprints API + UI** (`PUT /api/production/footprints/[assetId]`, DXF or
   W×D rectangle; `footprints-page.tsx` with kit `DataTable` +
   `(portal)/production/footprints`).
10. **Placements API + UI:** place/move/close endpoints (move requires both
    placement permissions, mirrors `reassign`); editor
    (`layout-editor-page.tsx`, `layout-palette.tsx`): drag & drop from the
    plant's asset palette, snap 0.1 m, rotate; `useCan` gates actions.
11. **Nav-cache:** after V13's seeded nav item, fire any `/api/nav/*` mutation
    (or cold restart) so `requireSectionOrRedirect("production")` picks up the
    new item (production.md gotcha).
12. **docs-sync** (module doc, ERD/dictionary V13 delta, routing row update) +
    verify: `pnpm lint && pnpm build`, dxf pipeline unit tests, visual pass
    importing plant 7's real DXF end-to-end (traced `EBI-*` file when the team
    produces it; the untraced file must yield a *useful validation report*, not
    a crash — that IS a test case).

## Database impact

V13 (`db/migrations/V13__production_plant_layout.sql`, dba proposal — full SQL
in the migration file): three additive tables in schema `production` —
`plant_layout` (versioned immutable canvas, one **active** per plant via
filtered unique index, `ISJSON`-checked geometry, lifecycle timestamps instead
of `updated_at`), `asset_footprint` (one per asset, editable, `dxf|rectangle`
source), `asset_placement` (temporal close+insert pattern of V11, filtered
unique current row per (layout, asset) — per-layout on purpose: draft
population coexists with the active version; physical single-location truth
comes from "one active layout per plant"). One nav item (`Layout`, icon `Map`
→ curated icon map needs the addition) + six `production.*` permission codes.
**Nothing irreversible** — purely additive; no new grants needed (V12 schema
grants cover future objects). Geometry as JSON in `NVARCHAR(MAX)`, native
GEOMETRY deliberately rejected until server-side spatial predicates exist.
Discipline for the build: never select the `geometry` column in list queries.

## Amendments

<!-- appended during /build-plan verification -->

- **Encoding decision corrected by the step-1 spike (2026-07-06):** the plan
  assumed windows-1252-first decoding; the real AC1032 file is **UTF-8** (DXF
  2007+ always is) and cp1252 mangles its accented layer names. `decode.ts`
  now picks UTF-8 for `$ACADVER >= AC1021` and maps `$DWGCODEPAGE` only for
  legacy files (replacement-char fallback covers lying headers). Contract doc
  and ADR 0006 record the rule.
- **Test runner added:** the repo had no test infrastructure; `vitest` came in
  as a devDependency with a `pnpm test` script and `vitest.config.ts` ("only
  new dependency: dxf-parser" holds for runtime deps).
- **Validation report is not persisted:** V13 has no report column, so the
  report returns to the wizard in the API response and failing imports persist
  *nothing* (no draft row, no blob) — a draft only exists for contract-valid
  files. Step 6's "draft row with geometry + report" is amended accordingly;
  the archived DXF makes any report reproducible.
- **File-map deltas:** added `src/modules/production/db/shared.ts` (schema
  bindings + cross-schema ref helpers shared by the three db files) and
  `GET /api/production/footprints` (list with asset refs, needed by the
  footprints page; not in the original route table).
- **Placement pose semantic:** `x_m`/`y_m` = center of the footprint bbox,
  rotation about that center (decided at build; documented in module doc).
- **Editor interaction:** palette uses click-to-arm → click-to-place instead
  of HTML5 drag & drop (robust over SVG); existing placements do drag with
  pointer capture; rotation via ±90° buttons on the selected asset.
- **Footprints entry point:** V13 seeded only the `Layout` nav item, so
  `/production/footprints` is reached via a header button in the viewer.
- **ADR 0002 amended in place:** container names became code constants and
  `AZURE_STORAGE_CONTAINER_MAINT` was removed (user decision 2026-07-06); the
  new ADR is numbered 0006.
- **RE-SCOPE (user decision 2026-07-06, after verification):** the module does
  not yet justify a place in the portal — it stays built but **dark-parked**.
  (a) New migration **V14** (dba-authored, applied to `EBI_dev`, now at v14)
  deletes the V13-seeded `Layout` nav item; tables/permissions/grants remain.
  (b) The four pages moved from `(portal)/production/*` to a **new
  `(portal)/test/*` area** — founded by this amendment as the portal's private
  component proving ground: admin-only segment guard (`assertAdminOrRedirect`,
  the same role gate as the admin panel — the user's "admin del departamento
  de digitalización" is the existing `admin` role), no nav section/items.
  Routes: `/test/layout[/import|/edit]`, `/test/footprints`. (c) APIs stay at
  `/api/production/**` gated by the V13 permissions (user choice). Re-verified:
  33/33 tests, lint+build green, `/test/*` → 200 as admin, old
  `/production/layout|footprints` → 404, nav shows only Líneas/Celdas after
  `revalidateTag("nav")` (the documented nav-cache gotcha applied in reverse —
  a nav-row *deletion* also needs the revalidation).
- **Verification evidence (2026-07-06):** 33/33 vitest unit tests green;
  `pnpm lint` + `pnpm build` green; 30/30 E2E checks as `tester` (import of
  the real untraced plant 7 DXF → 422 with `untraced-file` report; traced
  fixture → draft → confirm → carry-forward of 1 placement to v2 verified;
  move = close+insert with history growth; 404/409/413/422 codes; maintenance
  document upload/download regression green after the blob.ts refactor);
  visual pass over viewer/editor/footprints/wizard with the seeded `Map` nav
  item visible after a cold cache.
