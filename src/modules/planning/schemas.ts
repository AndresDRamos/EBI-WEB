import { z } from "zod";

/**
 * Request schemas for `/api/planning/*`. Dates arrive as `YYYY-MM-DD` strings
 * and are normalized to a UTC-midnight `Date` (the db layer types
 * `program_date` as `Date`, matching the repo's DATE-column convention).
 */

const positiveInt = (message: string) =>
  z.preprocess(
    (v) => (v == null || v === "" ? null : Number(v)),
    z
      .number()
      .refine((n) => Number.isInteger(n) && n > 0, { message })
      .nullable(),
  );

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const programDateStringSchema = z
  .string()
  .regex(DATE_RE, "Fecha inválida (se espera YYYY-MM-DD).");

/** Parse a validated `YYYY-MM-DD` string to a UTC-midnight Date. */
export function parseProgramDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

const requiredId = (message: string) =>
  positiveInt(message).refine((v): v is number => v !== null, { message });

const shift = z.preprocess(
  (v) => (v == null || v === "" ? null : Number(v)),
  z
    .number()
    .int()
    .refine((n) => n >= 1 && n <= 3, { message: "Turno inválido (1–3)." })
    .nullable(),
);

export const createProgramSchema = z.object({
  cell_id: requiredId("Celda inválida."),
  program_date: programDateStringSchema,
  shift: shift.optional().default(null),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = z
  .object({
    notes: z
      .preprocess(
        (v) => (typeof v === "string" ? (v.trim() ? v.trim() : null) : v),
        z.string().max(1000, "La nota es demasiado larga.").nullable(),
      )
      .optional(),
    // Status transitions via PATCH are limited to publishing a draft.
    status: z.literal("published").optional(),
  })
  .refine((d) => d.notes !== undefined || d.status !== undefined, {
    message: "Sin cambios.",
  });

export const addEntrySchema = z.object({ nesting_id: requiredId("Nesteo inválido.") });

export const reorderEntriesSchema = z.object({
  ordered_nesting_ids: z
    .array(requiredId("Nesteo inválido."))
    .min(1, "El orden no puede estar vacío."),
});

export const linkStationSchema = z.object({
  cell_id: requiredId("Celda inválida."),
  eps_station_id: requiredId("Estación inválida."),
});
