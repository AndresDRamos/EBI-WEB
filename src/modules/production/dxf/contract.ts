/**
 * Constants of the CAD layout contract (docs/architecture/cad-layout-contract.md).
 * Pure module — imported by the pipeline, API validation and UI copy alike.
 * Change the contract doc first; this file mirrors it.
 */

/** Layers the importer reads. Matched case-insensitively; canonical spelling here. */
export const EBI_LAYERS = {
  OUTLINE: "EBI-OUTLINE",
  WALL: "EBI-WALL",
  COLUMN: "EBI-COLUMN",
  AISLE: "EBI-AISLE",
  ZONE: "EBI-ZONE",
  ROUTE: "EBI-ROUTE",
  PORT: "EBI-PORT",
} as const;

export const ALL_EBI_LAYERS = Object.values(EBI_LAYERS);

/** Port block names; direction comes from the INSERT rotation. */
export const PORT_BLOCKS = {
  in: "EBI_PORT_IN",
  out: "EBI_PORT_OUT",
} as const;

/**
 * Unit plausibility for a plant outline, meters per side. The header
 * `$INSUNITS` is never trusted (plant 7 declares mm over meter geometry);
 * instead the outline extents must land in this range.
 */
export const PLANT_MIN_SIDE_M = 10;
export const PLANT_MAX_SIDE_M = 1000;

/** Same idea for per-asset footprint DXFs (a machine top view). */
export const FOOTPRINT_MIN_SIDE_M = 0.1;
export const FOOTPRINT_MAX_SIDE_M = 100;

/** Version stamp embedded in every normalized geometry JSON document. */
export const GEOMETRY_SCHEMA_VERSION = 1;
