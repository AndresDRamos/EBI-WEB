/**
 * Minimal hand-written ASCII DXF builders for pipeline tests. They emit just
 * enough structure for dxf-parser (HEADER + ENTITIES sections); the shapes
 * mirror what real AutoCAD exports produce for each entity.
 */

export interface HeaderOpts {
  acadver?: string;
  codepage?: string;
  insunits?: number;
}

const NL = "\n";

function rows(...pairs: Array<[number | string, string | number]>): string {
  return pairs.map(([code, value]) => `${code}${NL}${value}`).join(NL);
}

export function dxfFile(entities: string[], header: HeaderOpts = {}): string {
  const { acadver = "AC1032", codepage = "ANSI_1252", insunits } = header;
  const headerVars = [
    rows([9, "$ACADVER"], [1, acadver]),
    rows([9, "$DWGCODEPAGE"], [3, codepage]),
    ...(insunits !== undefined ? [rows([9, "$INSUNITS"], [70, insunits])] : []),
  ].join(NL);
  return [
    rows([0, "SECTION"], [2, "HEADER"]),
    headerVars,
    rows([0, "ENDSEC"]),
    rows([0, "SECTION"], [2, "ENTITIES"]),
    ...entities,
    rows([0, "ENDSEC"], [0, "EOF"]),
  ].join(NL);
}

export function lwpolyline(
  layer: string,
  vertices: Array<[number, number]>,
  closed: boolean,
): string {
  return [
    rows(
      [0, "LWPOLYLINE"],
      [8, layer],
      [90, vertices.length],
      [70, closed ? 1 : 0],
    ),
    ...vertices.map(([x, y]) => rows([10, x], [20, y])),
  ].join(NL);
}

export function lineEntity(
  layer: string,
  a: [number, number],
  b: [number, number],
): string {
  return rows(
    [0, "LINE"],
    [8, layer],
    [10, a[0]],
    [20, a[1]],
    [30, 0],
    [11, b[0]],
    [21, b[1]],
    [31, 0],
  );
}

export function insert(
  name: string,
  layer: string,
  x: number,
  y: number,
  rotation = 0,
): string {
  return rows(
    [0, "INSERT"],
    [8, layer],
    [2, name],
    [10, x],
    [20, y],
    [30, 0],
    [50, rotation],
  );
}

export function textEntity(
  layer: string,
  x: number,
  y: number,
  value: string,
): string {
  return rows(
    [0, "TEXT"],
    [8, layer],
    [10, x],
    [20, y],
    [30, 0],
    [40, 0.5],
    [1, value],
  );
}

export function circle(
  layer: string,
  x: number,
  y: number,
  radius: number,
): string {
  return rows([0, "CIRCLE"], [8, layer], [10, x], [20, y], [30, 0], [40, radius]);
}

/** A complete, contract-compliant plant file: 100×60 m outline at (50,30). */
export function tracedPlantFixture(): string {
  return dxfFile(
    [
      lwpolyline(
        "EBI-OUTLINE",
        [
          [50, 30],
          [150, 30],
          [150, 90],
          [50, 90],
        ],
        true,
      ),
      lineEntity("EBI-WALL", [50, 60], [120, 60]),
      lwpolyline(
        "EBI-AISLE",
        [
          [60, 35],
          [65, 35],
          [65, 85],
          [60, 85],
        ],
        true,
      ),
      lwpolyline(
        "EBI-ZONE",
        [
          [100, 40],
          [140, 40],
          [140, 80],
          [100, 80],
        ],
        true,
      ),
      textEntity("EBI-ZONE", 120, 60, "ALMACEN"),
      circle("EBI-COLUMN", 70, 50, 0.3),
      lwpolyline(
        "EBI-ROUTE",
        [
          [55, 32],
          [120, 32],
          [120, 70],
        ],
        false,
      ),
      insert("EBI_PORT_IN", "EBI-PORT", 50, 45, 0),
      insert("EBI_PORT_OUT", "EBI-PORT", 150, 75, -90),
    ],
    { insunits: 4 },
  );
}

/** An "architect only" file: geometry but zero EBI-* layers (plant 7 today). */
export function untracedFixture(): string {
  return dxfFile(
    [
      lineEntity("ARP MURO PRECOLADO", [0, 0], [226, 0]),
      lineEntity("ARP MURO PRECOLADO", [226, 0], [226, 178]),
      insert("CORTINA DE ANDEN", "ANDENES", 22.4, 138.8, 0),
      textEntity("SEÑALIZACIÓN", 10, 10, "RUTA DE EVACUACIÓN"),
    ],
    { insunits: 4 },
  );
}
