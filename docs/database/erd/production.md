# ERD — `production` schema

> Generated from the applied migrations `V11__produccion_schema.sql`,
> `V12__rename_produccion_schema_to_production.sql`,
> `V13__production_plant_layout.sql` and
> `V19__production_operative_cells.sql` (V12 renamed the schema `produccion` →
> `production`; V13 added the three plant-layout tables; V19 collapsed
> `production_line` + `cell` into a single self-referencing `cell`). Do not
> edit by hand; the `docs-sync` sub-agent regenerates it at the close of each
> build.
>
> Last synced: 2026-07-14. Reflects V11 + V12 + V13 + V15 + V18 + V19 + V20.
> **V20 (plan laser-cut-sequencing) did not change `production`'s own
> tables** — it added two new *inbound* cross-schema FKs pointing **at**
> `production.cell` from the new `planning` schema
> (`planning.cell_station_link.cell_id` and `planning.machine_program.cell_id`,
> both NO ACTION — see [`docs/database/erd/planning.md`](planning.md)). V15 did
> not change `production`'s tables; it transferred `auth.plant` → `org.plant`,
> so the `plant_id` FKs below now cross to `org` (re-pointed by `object_id`,
> not recreated). V18 added `cell.location_id` (NULLable FK to the new
> `org.location`). **V19 (plan production-operative-cells) dropped
> `production.production_line` (rows converted to parent cells first),
> dropped `cell.plant_id` and `cell.line_id`, renamed `sequence_in_line` →
> `sequence_in_parent`, made `cell.location_id` NOT NULL, and added
> `cell.parent_cell_id` (self-FK) / `size_x_m` / `size_y_m` / `process_id` +
> the new `cell_code_sequence` table.** Sourced from the applied migration
> file + regenerated Kysely types, not direct introspection (`ebi-sql-dev`
> MCP not used this session). See `docs/database/erd/org.md`.

```mermaid
erDiagram

    cell {
        int cell_id PK
        nvarchar_32 code "app-generated: {plant.code}-{location.code}-{NN}"
        nvarchar_160 name
        int location_id FK "NOT NULL since V19; plant derived through it"
        int parent_cell_id FK "self-FK; NULL = top-level cell (V19)"
        int sequence_in_parent "only when parent_cell_id set (V19, renamed from sequence_in_line)"
        decimal_9_3 size_x_m "footprint width, meters (V19)"
        decimal_9_3 size_y_m "footprint depth, meters (V19)"
        int process_id FK "declared process; NULLable, cross-schema to org.process (V19)"
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    cell_code_sequence {
        int location_id PK_FK "race-safe per-location code counter (V19)"
        int next_seq
    }

    asset_cell_assignment {
        int assignment_id PK
        int asset_id FK
        int cell_id FK
        nvarchar_120 role_label
        date valid_from
        date valid_to "NULL = currently in effect"
        int created_by FK
        nvarchar_1000 note
        datetime2 created_at
    }

    plant_layout {
        int layout_id PK
        int plant_id FK
        int version "unique per plant"
        nvarchar_160 name
        nvarchar_1000 note
        nvarchar_400 source_blob_path "archived source DXF in Azure Blob"
        decimal_9_3 width_m
        decimal_9_3 height_m
        nvarchar_max geometry "normalized JSON, ISJSON-checked"
        nvarchar_20 status "draft | active | archived"
        int created_by FK
        datetime2 created_at
        datetime2 activated_at "set once, on confirm"
        datetime2 archived_at "set once, when replaced/retired"
    }

    asset_footprint {
        int footprint_id PK
        int asset_id FK "UQ — one footprint per asset"
        decimal_9_3 width_m
        decimal_9_3 depth_m
        nvarchar_max geometry "JSON polygon + ports, ISJSON-checked"
        nvarchar_12 source_kind "dxf | rectangle"
        nvarchar_400 source_blob_path "only when source_kind = dxf"
        int created_by FK
        datetime2 created_at
        datetime2 updated_at
    }

    asset_placement {
        int placement_id PK
        int layout_id FK
        int asset_id FK
        decimal_9_3 x_m "footprint bbox center, meters"
        decimal_9_3 y_m "footprint bbox center, meters"
        decimal_5_2 rotation_deg "0 <= deg < 360, about the center"
        date valid_from
        date valid_to "NULL = currently in effect"
        int created_by FK
        nvarchar_1000 note
        datetime2 created_at
    }

    %% ── relationships ───────────────────────────────────────────────────────

    cell ||--o{ cell : "parent of (self-FK, depth <= 1, app-enforced) (V19)"
    cell ||--o{ asset_cell_assignment : "composed of (temporal)"
    plant_layout ||--o{ asset_placement : "positions (temporal)"
```

## Cross-schema FKs

- `cell.location_id` → `org.location.location_id` (no cascade; NOT NULL since
  V19 — was NULLable in V18; unfiltered index `IX_cell_location (location_id,
  is_active)` since V19, was filtered in V18). `cell.plant_id` was **dropped
  in V19** — the plant is now derived via `location_id → org.plant`, same as
  `maint.asset` since V18.
- `cell.process_id` → `org.process.process_id` (no cascade; NULLable, added
  V19).
- `cell_code_sequence.location_id` → `org.location.location_id` (no cascade;
  PK, added V19).
- `asset_cell_assignment.asset_id` → `maint.asset.asset_id` (no cascade: history
  survives the asset being retired).
- `asset_cell_assignment.created_by` → `auth.app_user.user_id` (no cascade:
  authorship history preserved).
- `plant_layout.plant_id` → `org.plant.plant_id` (no cascade; was `auth.plant` before V15).
- `plant_layout.created_by` → `auth.app_user.user_id` (no cascade).
- `asset_footprint.asset_id` → `maint.asset.asset_id` (no cascade).
- `asset_footprint.created_by` → `auth.app_user.user_id` (no cascade).
- `asset_placement.asset_id` → `maint.asset.asset_id` (no cascade).
- `asset_placement.created_by` → `auth.app_user.user_id` (no cascade).

All FKs are NO ACTION — catalog rows and history are protected, never cascaded.
`production_line.plant_id` (a cross-schema FK to `org.plant`) no longer
exists — the table was dropped in V19.

### Inbound cross-schema references (V20)

Two tables in the new `planning` schema point **at** `production.cell` (both NO
ACTION — the cell catalog is protected; the planning app returns 409 rather than
cascading):

- `planning.cell_station_link.cell_id` → `production.cell.cell_id` (1:1 EBI
  cell ↔ EPS laser station mapping).
- `planning.machine_program.cell_id` → `production.cell.cell_id` (per-cell laser
  sequence programs).

See [`docs/database/erd/planning.md`](planning.md). `production` owns neither
table; it only supplies the referenced `cell` rows.

## Design notes (V11)

- **Temporal M:N bridge, historized.** `asset_cell_assignment` records asset ↔
  cell composition over time: a cell can hold several assets and one asset can
  serve several cells simultaneously (e.g. a shared feed tower on "Laser 1" and
  "Laser 2"). A reassignment is *close the current row (`valid_to`) + open a new
  one* — `asset_id`/`cell_id` are never UPDATEd in place.
- **No `updated_at` on `asset_cell_assignment`, on purpose.** Rows are immutable
  once written except for closing `valid_to`; an `updated_at` would invite the
  in-place rewrite this design exists to prevent.
- **Filtered unique index `UQ_asset_cell_assignment_current`**
  `(asset_id, cell_id) WHERE valid_to IS NULL`: at most one *current* row per
  (asset, cell) pair, without limiting how many distinct cells an asset serves
  or how many assets a cell holds. `IX_asset_cell_assignment_asset` /
  `IX_asset_cell_assignment_cell` `(…, valid_from)` serve "where is asset X" and
  "what is in cell Y" plus their histories.
- **`cell.line_id` was nullable — superseded by V19.** The original design had
  standalone cells ("Laser 1") with no line, `sequence_in_line` requiring a
  line (`CK_cell_sequence_requires_line`) and the filtered unique index
  `UQ_cell_line_sequence`. V19 replaced the whole line/cell split with a
  single self-referencing `cell` — see "Design notes (V19)" below for the
  current shape (`parent_cell_id` / `sequence_in_parent` /
  `UQ_cell_parent_sequence`).
- Enumerations via named CHECK constraints, soft-delete via `is_active`,
  app-maintained `updated_at` (no triggers) — same house pattern as `maint`
  (V5/V6).
- Companion change in `maint`: V11 also added `maint.asset.asset_category`
  (`production_equipment` | `material_handling`) — see
  [maint.md](maint.md). Material-handling equipment shares the maintenance
  catalog but typically has no fixed cell (shared plant pool), so assignment
  rows stay optional for that category.
- Grants: `ebi_app` = SELECT/INSERT/UPDATE/DELETE on schema `production`;
  `ebi_agent_ro` = SELECT (guarded, idempotent; re-issued by V12 after the
  schema rename — schema-scoped grants do not survive `DROP SCHEMA`). V13
  added **no** new grants: the V12 schema-level grants cover the new tables.

## Design notes (V13 — plant layout)

- **`plant_layout` is an immutable, versioned canvas per plant.** A DXF upload
  is parsed into normalized JSON and lands as a `draft`; confirming it
  activates the draft and archives the previous `active`. Geometry is never
  edited in place — a correction is a new upload = a new version (ADR 0006).
  `UQ_plant_layout_plant_version (plant_id, version)` numbers the versions;
  the **filtered unique index `UQ_plant_layout_active` `(plant_id) WHERE
  status = N'active'`** guarantees exactly one active layout per plant (drafts
  and archived versions are unconstrained).
- **No generic `updated_at` on `plant_layout`** — the only legitimate mutations
  are lifecycle transitions, captured explicitly by `activated_at` /
  `archived_at` (same reasoning as `asset_cell_assignment`).
- **Geometry is JSON in `NVARCHAR(MAX)` (`ISJSON` CHECK), not the native
  GEOMETRY type:** rendering happens client-side, no server-side spatial
  predicates exist yet, and DXF-derived payloads (zones / aisles /
  route-centerlines / ports + metadata) do not map cleanly onto OGC
  primitives. Revisit only when a real spatial query appears.
- **`asset_footprint` is ONE top-view shape per asset**
  (`UQ_asset_footprint_asset`, which doubles as the FK-support index) and is
  **editable in place** (`created_at`/`updated_at`, app-maintained): footprint
  shape is presentation, not history. `CK_asset_footprint_source_kind`
  (`dxf` | `rectangle`) and `CK_asset_footprint_source_path` (a rectangle has
  no source file; only a `dxf` footprint may archive `source_blob_path`).
- **`asset_placement` is the temporal position of an asset on a layout** —
  same invariant family as `asset_cell_assignment`: reposition = close the
  current row (`valid_to`) + insert a new one; `x_m`/`y_m`/`rotation_deg` are
  never UPDATEd in place, and there is **no `updated_at` on purpose**.
  `CK_asset_placement_rotation` (`0 ≤ deg < 360`), `CK_asset_placement_range`
  (`valid_to ≥ valid_from` or NULL).
- **Filtered unique index `UQ_asset_placement_current` `(layout_id, asset_id)
  WHERE valid_to IS NULL`**: one *current* placement per asset **per layout**
  — deliberately NOT per asset globally, so a draft layout can be populated
  while the active layout still holds the asset's live position (the
  draft-preparation overlap window). Physical truth ("where is the asset
  really") = current placement JOIN its layout WHERE `status = 'active'`;
  `UQ_plant_layout_active` guarantees that join yields at most one row per
  plant. On activation the app closes the outgoing layout's open rows and
  inserts fresh rows on the new version (carry-forward); archived layouts keep
  their closed history untouched. `IX_asset_placement_layout` /
  `IX_asset_placement_asset` `(…, valid_from)` serve composition and history
  queries.
- **Cross-schema invariant enforced by the app, not the DB** (house style: no
  triggers): the asset's plant must match `plant_layout.plant_id` for a
  placement — validated by the API when creating placements (422 otherwise).
  Since V18 the asset's plant is **derived** via
  `maint.asset.location_id → org.location.plant_id` (the direct
  `asset.plant_id` column was dropped).
- Blob paths only, never content: `source_blob_path` points at the archived
  original DXF in the private `production` container (account `ezistorage`).

## Design notes (V18 — cell location)

- **`cell.location_id` was a NULLable cross-schema FK to `org.location`** — a
  cell could optionally sit inside a named location within its plant.
  Filtered index `IX_cell_location` only paid for linked rows (same pattern
  as `IX_asset_parent`, V5). Existing cells stayed NULL at apply time.
  **Superseded by V19**: `location_id` is now NOT NULL on every cell and
  `IX_cell_location` is unfiltered — see "Design notes (V19)" below.
- **App-enforced invariant (no triggers):** creating or reassigning an
  `asset_cell_assignment` requires `cell.location_id` to be set **and** equal
  to `maint.asset.location_id` (the APIs return 422 otherwise). Moving an
  asset to another location auto-closes its current assignments (historized
  close via `valid_to`, never a delete) — done by the maintenance asset PATCH.
  This invariant is unchanged by V19 (still checked on both `create` and
  `reassign`).
- ~~The API layer also validates that a cell's `location_id` belongs to the
  cell's own plant (422) when creating/updating cells.~~ No longer applicable
  since V19: `cell.plant_id` is gone (the plant is derived through
  `location_id`), so there is nothing left to cross-validate; `location_id`
  itself is chosen once at create and is immutable thereafter (the cell
  `code` encodes it).

## Design notes (V19 — operative cells: line/cell collapse)

- **`production.cell` becomes a single self-referencing hierarchy, depth
  capped at 1.** `production_line` and the old two-level `cell` model are
  gone; every "line" row was converted to a *parent* cell
  (`parent_cell_id IS NULL`) before the table was dropped (see
  `production.production_line` in `dictionary/production.md` for the
  conversion recipe). A child cell (`parent_cell_id` set) may not itself have
  children — **not expressible as a CHECK** (a self-referencing depth bound
  needs a recursive check or a trigger, both against house style/impossible
  in plain CHECK), so it is **enforced by the app only**, in exactly two
  places: `createCell`/`updateCell` in `modules/production/db/cell.ts` and the
  `PATCH /api/production/cells/[id]` route (see
  `docs/modules/production.md`, "Do not touch"). The DB backs only the
  narrower invariant it *can* express, `CK_cell_not_self_parent`
  (`parent_cell_id IS NULL OR parent_cell_id <> cell_id`).
- **`cell.location_id` is NOT NULL and `cell.plant_id` is dropped** — every
  cell now sits in a named location and the plant is **derived** via
  `location_id → org.location.plant_id`, mirroring the V18 move on
  `maint.asset`. `IX_cell_location` is unfiltered now that the column can't
  be NULL (was `WHERE location_id IS NOT NULL` in V18).
- **`cell.code` is app-generated**, `{plant.code}-{location.code}-{NN}`,
  sequential **per location** — same pattern as `maint.asset`'s matrícula
  (V17/V18): `createCell` claims `cell_code_sequence.next_seq` under
  `UPDLOCK + SERIALIZABLE` inside the insert transaction before building the
  code. `CellCodeOverflowError` when the 2-digit sequence (`NN`, max 99)
  would overflow. `code` and `location_id` are immutable after create — the
  code encodes the location, so `updateCell` never accepts either.
- **`sequence_in_parent`** (renamed from `sequence_in_line`) keeps the same
  shape as before: `CK_cell_sequence` (`> 0` or NULL),
  `CK_cell_sequence_requires_parent` (requires `parent_cell_id` set), and the
  filtered unique index `UQ_cell_parent_sequence`
  `(parent_cell_id, sequence_in_parent) WHERE parent_cell_id IS NOT NULL AND sequence_in_parent IS NOT NULL`
  — successor of `UQ_cell_line_sequence`, now filtered on **both** columns
  (parent cells themselves, and any unsequenced child, stay unconstrained).
  `reorderCellChildren` (`modules/production/db/cell.ts`) persists a new Op10/
  Op20… order in two passes (negative temp values, then final `(i+1)*10`) to
  dodge the filtered unique index while reordering.
- **`size_x_m` / `size_y_m`** (`CK_cell_size_x` / `CK_cell_size_y`, both
  `> 0` or NULL) are the cell's footprint dimensions, captured at create —
  unlike `production.asset_footprint` this is a plain width/depth pair, no
  DXF/polygon geometry.
- **`process_id`** is a NULLable FK to `org.process` declaring which process
  the cell performs. Since V19 it backs a new cross-schema invariant on
  `asset_cell_assignment`: when set, only asset types linked to that process
  (`maint.asset_type_process`) may be assigned to the cell —
  `assetTypeSupportsProcess` in `modules/maintenance/db.ts`, checked by both
  the assignment `create` and `reassign` routes (422 otherwise, app-enforced,
  no triggers) — see `docs/database/dictionary/production.md`,
  `asset_cell_assignment`.
- **`production.cell_code_sequence` mirrors `maint.asset_code_sequence`**
  (V17/V18) but keys on `location_id` alone (cells don't have a separate
  type/category dimension the way assets do).
- Nav: V19 retires the `Líneas` (`/production/lines`) and `Celdas`
  (`/production/cells`) nav items and seeds `Celdas operativas`
  (`/production/operative-cells`) in their place — same guarded DELETE +
  INSERT pattern as V14/V15/V11.
- RBAC: V19 deletes the `production.line:{create,update}` permission codes
  (cascades any `role_permission` grants, none seeded in practice);
  `production.cell:*` and `production.assignment:*` are unaffected.
- No new grants: the V12 schema-level grants already cover
  `cell_code_sequence` (re-issued idempotently as belt-and-suspenders,
  V17/V18 precedent).
