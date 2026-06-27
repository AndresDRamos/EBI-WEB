// db/gen.mjs
// Runs kysely-codegen against EBI_dev to regenerate src/lib/db/types.ts.
//
// Why a wrapper instead of inlining the URL in the npm script:
//   - The old `db:gen` used POSIX `${VAR}` interpolation, which the Windows shell
//     pnpm spawns (cmd.exe) does NOT expand — the literal `${DB_SERVER}` reached
//     tedious and failed with ENOTFOUND.
//   - This script is invoked as `node --env-file=.env db/gen.mjs`, so Node loads
//     the DB_* secrets from .env (no manual shell loading), builds the connection
//     string here, and execs the kysely-codegen CLI with the current Node binary
//     (no shell, no quoting pitfalls). Cross-platform, single source of secrets.
//
// NO secret is stored in this file. DB_* come from .env at run time (same vars the
// app and db/seed/bootstrap-admin.mjs use). DB_USER should be a read-capable user
// on the auth/dbo/etl schemas (ebi_agent_ro is enough for introspection).
//
// Usage (from repo root): pnpm db:gen

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const { DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD, DB_ENCRYPT } = process.env;

if (!DB_SERVER || !DB_DATABASE || !DB_USER || !DB_PASSWORD) {
  console.error('✗ Missing DB_* env vars — they should be loaded from .env via --env-file.');
  process.exit(1);
}

const encrypt = String(DB_ENCRYPT ?? 'true').toLowerCase() !== 'false';
const url =
  `Server=${DB_SERVER},1433;Database=${DB_DATABASE};` +
  `User Id=${DB_USER};Password=${DB_PASSWORD};` +
  `Encrypt=${encrypt};TrustServerCertificate=false`;

// Resolve the kysely-codegen CLI entry so we can run it with the current Node
// binary (avoids OS-specific .bin/.cmd shims and shell argument quoting).
const require = createRequire(import.meta.url);
const pkgJsonPath = require.resolve('kysely-codegen/package.json');
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
const binRel =
  typeof pkgJson.bin === 'string' ? pkgJson.bin : pkgJson.bin['kysely-codegen'];
const binAbs = join(dirname(pkgJsonPath), binRel);

const result = spawnSync(
  process.execPath,
  [binAbs, '--dialect', 'mssql', '--out-file', 'src/lib/db/types.ts', '--url', url],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
