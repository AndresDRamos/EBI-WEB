import { Kysely, MssqlDialect } from "kysely";
import * as Tedious from "tedious";
import * as Tarn from "tarn";
import type { DB } from "./types";

/**
 * Kysely client for the EBI database, connecting at runtime as the least-
 * privileged app user `ebi_app`. Migrations are owned by Flyway under
 * `ebi_migrator`; this client performs CRUD only.
 *
 * Connection settings are read from env (see `.env.example`). Queries MUST be
 * typed through Kysely against `DB` — no raw untyped queries outside this
 * directory.
 */

const required = (name: string): string => {
  const value = process.env[name];
  if (typeof value === "undefined" || value === "") {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
};

const encrypt = (process.env.DB_ENCRYPT ?? "true").toLowerCase() === "true";

const dialect = new MssqlDialect({
  tarn: {
    ...Tarn,
    options: {
      min: 0,
      max: 10,
    },
  },
  tedious: {
    ...Tedious,
    connectionFactory: () =>
      new Tedious.Connection({
        server: required("DB_SERVER"),
        authentication: {
          type: "default",
          options: {
            userName: required("DB_USER"),
            password: required("DB_PASSWORD"),
          },
        },
        options: {
          database: required("DB_DATABASE"),
          port: 1433,
          encrypt,
          trustServerCertificate: encrypt === false,
        },
      }),
  },
});

export const db = new Kysely<DB>({ dialect });

export type { DB };