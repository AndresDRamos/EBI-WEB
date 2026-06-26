// db/seed/bootstrap-admin.mjs
// One-off: create the FIRST portal admin so login works after migration V3.
// Idempotent: re-running updates the password and re-activates the account.
//
// NO secret is stored in this file. Username/password come from environment
// variables at run time. The password is hashed with @node-rs/argon2 (argon2id),
// the SAME library the portal uses to verify — see the caveat at the bottom.
//
// Requirements:
//   - Migration V3 applied (auth schema + seeded roles admin/viewer).
//   - `@node-rs/argon2` installed (added by OpenCode in M1). `tedious` is already a dep.
//   - DB_* env vars (loaded from .env). DB_USER must have CRUD on the `auth` schema
//     (that is `ebi_app`, granted by V3).
//
// Usage (PowerShell, from repo root):
//   Get-Content .env | Where-Object { $_ -match '^\s*DB_[A-Z_]+\s*=' } | ForEach-Object {
//     $n,$v = $_ -split '=',2; Set-Item "env:$($n.Trim())" $v.Trim().Trim('"').Trim("'") }
//   $env:ADMIN_USERNAME = 'admin'
//   $env:ADMIN_PASSWORD = '<choose-a-strong-password>'      # not stored anywhere
//   $env:ADMIN_EMAIL    = 'admin@ezimetales.com'            # optional
//   node db/seed/bootstrap-admin.mjs
//
// After it runs, clear the secret from the session: Remove-Item Env:ADMIN_PASSWORD

import { Connection, Request, TYPES } from 'tedious';
import { hash } from '@node-rs/argon2';

const {
  DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD, DB_ENCRYPT,
  ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL, ADMIN_DISPLAY,
} = process.env;

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) fail('Set ADMIN_USERNAME and ADMIN_PASSWORD.');
if (!DB_SERVER || !DB_DATABASE || !DB_USER || !DB_PASSWORD) {
  fail('Missing DB_* env vars — load them from .env first.');
}

const SQL = `
SET NOCOUNT ON;
DECLARE @uid INT;
SELECT @uid = user_id FROM auth.app_user WHERE username = @username;
IF @uid IS NULL
BEGIN
  INSERT INTO auth.app_user (username, email, display_name, password_hash, all_plants, is_active)
  VALUES (@username, NULLIF(@email, N''), @display, @hash, 1, 1);
  SET @uid = SCOPE_IDENTITY();
END
ELSE
BEGIN
  UPDATE auth.app_user SET password_hash = @hash, is_active = 1 WHERE user_id = @uid;
END

INSERT INTO auth.user_role (user_id, role_id)
SELECT @uid, r.role_id FROM auth.role r
WHERE r.name = N'admin'
  AND NOT EXISTS (SELECT 1 FROM auth.user_role ur WHERE ur.user_id = @uid AND ur.role_id = r.role_id);

SELECT @uid AS user_id;
`;

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Connection({
      server: DB_SERVER,
      authentication: { type: 'default', options: { userName: DB_USER, password: DB_PASSWORD } },
      options: {
        database: DB_DATABASE,
        port: 1433,
        encrypt: String(DB_ENCRYPT ?? 'true').toLowerCase() !== 'false',
        trustServerCertificate: false,
        rowCollectionOnRequestCompletion: true,
      },
    });
    conn.on('connect', (err) => (err ? reject(err) : resolve(conn)));
    conn.connect();
  });
}

function run(conn, passwordHash) {
  return new Promise((resolve, reject) => {
    let userId = null;
    const req = new Request(SQL, (err) => (err ? reject(err) : resolve(userId)));
    req.addParameter('username', TYPES.NVarChar, ADMIN_USERNAME);
    req.addParameter('email', TYPES.NVarChar, ADMIN_EMAIL ?? '');
    req.addParameter('display', TYPES.NVarChar, ADMIN_DISPLAY ?? 'Portal Administrator');
    req.addParameter('hash', TYPES.NVarChar, passwordHash);
    req.on('row', (cols) => { userId = cols[0]?.value ?? userId; });
    conn.execSql(req);
  });
}

let conn;
try {
  const passwordHash = await hash(ADMIN_PASSWORD); // argon2id (library default)
  conn = await connect();
  const userId = await run(conn, passwordHash);
  console.log(`✓ Bootstrap admin '${ADMIN_USERNAME}' ready (user_id=${userId}, role=admin, all_plants=1).`);
  console.log('  Log in once the portal M1 is built. Then rotate this password from the portal.');
} catch (e) {
  fail(`Bootstrap failed: ${e.message}`);
} finally {
  conn?.close();
}

// CAVEAT — hashing compatibility:
// This uses @node-rs/argon2 `hash()` with default options (argon2id). The portal verifies
// with the same library, and argon2 encodes its parameters inside the hash, so custom
// memory/time/parallelism in the app still verify fine. The ONLY thing that would break
// verification is if the app's hashPassword() adds a `secret` (pepper). If you see that in
// src/lib/auth/password.ts, generate the hash with that same secret (or just reset the
// admin password from the portal once you are in).
