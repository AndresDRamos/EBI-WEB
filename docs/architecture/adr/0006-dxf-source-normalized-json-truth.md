# ADR 0006 — DXF as source, normalized JSON as portal truth

- **Status:** accepted (2026-07-06)
- **Plan:** plant-layout-foundation

## Context

The portal digitizes plant floor layouts. The raw material is the architect's
DXF (AutoCAD 2018/AC1032 for plant 7), which is messy by nature: 35 mixed
layers, loose LINEs instead of closed regions, a header that declares
millimeters over geometry drawn in meters, blocks with no attributes. Rendering
or querying that directly — on every page view, in the browser — would couple
the whole portal to CAD parsing quirks.

## Decision

- **The DXF is an input artifact, never the runtime source.** On import the
  file is archived verbatim in the private `production` blob container
  (`plant_layout.source_blob_path`, ADR 0002 pattern) and parsed **once**,
  server-side, into a normalized JSON document stored in
  `production.plant_layout.geometry` (`ISJSON`-checked `NVARCHAR(MAX)`).
- **The importer reads only the CAD contract**
  ([cad-layout-contract.md](../cad-layout-contract.md)): `EBI-*` layers and
  `EBI_PORT_IN`/`EBI_PORT_OUT` blocks. Everything else in the file is ignored,
  so the architect's plan never needs cleaning.
- **Normalized JSON is the single truth the portal renders and will query.**
  Meters, origin translated to (0,0), closed polygons as vertex arrays, ports
  as `{x, y, direction_deg, kind, label}`, `EBI-ROUTE` centerlines preserved
  verbatim for the future routing phase. The SVG viewer draws JSON, not DXF.
- **Layout versions are immutable.** A parse bug fix or a re-trace = new
  upload = new `version` row (draft → confirm lifecycle, one `active` per
  plant enforced by a filtered unique index). The archived DXF makes any
  version reproducible if the pipeline improves later.
- **Parsing is a pure module** (`src/modules/production/dxf/`, no I/O): bytes
  in → `{geometry, report}` out — unit-testable without a database or blob
  account, reusable for both plant layouts and per-asset footprint DXFs.

## Consequences

- Viewer performance and correctness are decoupled from CAD quirks; parser
  fixes never mutate stored layouts retroactively (immutability + archived
  source give explicit re-import instead).
- The JSON schema is a portal-owned contract; extending it (routing graphs,
  zones metadata) is additive and versioned by layout row, not by file format.
- Storing geometry as JSON forgoes SQL spatial predicates — accepted until a
  real server-side spatial query appears (documented in V13; revisit with the
  native `GEOMETRY` type then).
- Encoding/unit lies in real files are handled once, in the importer, with a
  validation report instead of crashes: UTF-8 for `$ACADVER >= AC1021`,
  codepage fallback for older files; extents-based unit plausibility (10–1000 m
  per side) instead of `$INSUNITS`.
