# CAD layout contract — EBI plant layouts

**Audience:** whoever prepares a plant DXF for the EBI portal importer (CAD
work happens in-house over the architect's plan). **The importer only reads
what this contract names; everything else in the file is ignored.** Grounded in
the forensic analysis of plant 7's real file (`SF - Nave piso.dxf`, 2026-07-06)
and the dxf-parser spike of the same date.

## The idea

The architect's DXF is never imported as-is. You **trace** a small set of
`EBI-*` layers over the architect's plan in CAD, then export the whole file.
The importer extracts only the `EBI-*` layers and the `EBI_PORT_*` blocks,
normalizes them into the portal's JSON geometry, and archives the original DXF
in Azure Blob untouched. Architect layers (`ARP *`, `P-OFF-*`, dimensioning,
furniture blocks…) stay in the file — they are simply not read.

## Layers the importer reads

| Layer | Contains | Geometry rule |
|---|---|---|
| `EBI-OUTLINE` | The plant's outer boundary | Exactly **one closed** LWPOLYLINE. Defines the canvas extents. **Required.** |
| `EBI-WALL` | Interior walls / precast panels | LINEs or LWPOLYLINEs (open allowed) |
| `EBI-COLUMN` | Structural columns | Closed LWPOLYLINEs or CIRCLEs |
| `EBI-AISLE` | Traffic aisles | **Closed** LWPOLYLINEs |
| `EBI-ZONE` | Named functional zones (warehouse, docks, WIP…) | **Closed** LWPOLYLINEs; a TEXT/MTEXT on the same layer inside the polygon becomes the zone label |
| `EBI-ROUTE` | Material-flow centerlines (future routing) | Open LWPOLYLINEs; preserved verbatim in the JSON, not rendered in v1 |
| `EBI-PORT` | Port block INSERTs (see below) | Only `EBI_PORT_IN` / `EBI_PORT_OUT` INSERTs are read on this layer |

Layer names are matched case-insensitively but **write them exactly as above,
ASCII only** — no accents, no spaces. Anything not in this table is ignored.

## Port blocks

Entry/exit points (dock doors, personnel doors, transfer windows) are INSERTs
of two block definitions you create once:

- Block name **`EBI_PORT_IN`** — material/goods entry point.
- Block name **`EBI_PORT_OUT`** — exit point.

Rules:

- **Direction = the INSERT's rotation angle** (0° = pointing +X, counter-
  clockwise, AutoCAD convention). Rotate the insert so it points *into* the
  plant for IN, *out of* it for OUT.
- The block *may* carry one ATTRIB for a human label (e.g. `ANDEN-3`); the
  importer uses it when present but **must not rely on it** — attribute-less
  inserts are valid (plant 7's real blocks carry no attributes, and the parser's
  ATTRIB support is weak). Fallback label: `IN-1`, `IN-2`, … in draw order.
- Block geometry (the arrow you draw inside the block) is cosmetic; the
  importer reads only name + insertion point + rotation.
- Natural candidates in plant 7: the 10 `CORTINA DE ANDEN` dock curtains, the
  10 `Rampa 2` leveling ramps and the door blocks — place an `EBI_PORT_*`
  insert at each relevant one.

## Units, origin and scale

- **Draw in meters.** 1 drawing unit = 1 meter. Do not trust `$INSUNITS` to
  say so — plant 7's header declares millimeters while the geometry is plainly
  in meters; the importer ignores the header and instead checks that the
  `EBI-OUTLINE` extents land in a plausible **10–1000 m per side** range. A
  file whose outline spans 226 × 178 units passes as meters; one spanning
  226 000 units gets flagged in the validation report as "probably millimeters".
- **Origin does not matter.** The importer auto-translates the `EBI-OUTLINE`
  bounding-box minimum to (0,0) and reports the offset it applied. Trace
  wherever the architect's plan sits.
- Z coordinates are discarded (top view only).

## Closed-polyline rule

`EBI-OUTLINE`, `EBI-AISLE`, `EBI-ZONE` and polyline `EBI-COLUMN`s must be
**closed** polylines (in AutoCAD: the `Close` option / `PEDIT → Close`, not a
last vertex that merely lands on the first). The importer reads the DXF closed
flag, not coordinate coincidence. Open polylines on these layers become
validation-report errors, and the plant 7 baseline shows why the rule exists:
the architect's file contains **zero** closed polylines — everything is loose
LINEs, unusable as regions.

## Export recipe (AutoCAD)

1. `AUDIT` → fix errors.
2. `-PURGE` → all (removes unused blocks/layers; keeps the file lean).
3. `SAVEAS` → **AutoCAD 2018 DXF** (`AC1032`). ASCII DXF, not binary.
4. Filename free-form; the portal stores it under its own key.

Files ≤ 50 MB (the importer rejects larger uploads). Plant 7's full file is
~1.3 MB — traced layers add little.

## Encoding note (importer-facing)

DXF 2007+ (`$ACADVER >= AC1021`) files are **UTF-8**; older files use the
`$DWGCODEPAGE` codepage (e.g. `ANSI_1252` → windows-1252). The importer
pre-scans the header and picks the decoder accordingly — verified against
plant 7 (AC1032, UTF-8, accented architect layer names decode cleanly). This
is transparent to the CAD author; it is recorded here because the
windows-1252-first assumption from the initial ezdxf analysis was **corrected**
by the dxf-parser spike (2026-07-06).

## Footprint DXFs (per-asset top views)

Asset footprints accept a *small* DXF with the same conventions, reduced:

- One closed LWPOLYLINE on `EBI-OUTLINE` = the machine's top-view outline, in
  meters, drawn anywhere (auto-translated to a local (0,0)).
- Optional `EBI_PORT_IN` / `EBI_PORT_OUT` inserts for the machine's own
  material entry/exit points.
- Everything else ignored. The quick alternative in the portal is a plain
  W×D rectangle — no CAD needed.

## What the importer does with violations

Violations never crash the import: every rule above maps to a line in the
**validation report** (severity `error` blocks confirming the draft; `warning`
does not). Uploading an untraced architect file (no `EBI-*` layers at all) is
the canonical test: it must produce a clear, useful report saying exactly which
layers are missing.
