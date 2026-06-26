# Seed data

Optional reference/seed data for development (e.g. initial `dbo.report_category` rows).
Keep seeds idempotent and environment-aware; never seed production with throwaway data.
Apply seeds as Flyway repeatable migrations (`R__seed_*.sql`) or a separate script.

## Bootstrap the first admin (`bootstrap-admin.mjs`)

After migration **V3** there are no users yet (only the seeded `admin`/`viewer` roles), so
nobody can log in. This one-off script creates the first admin. It is **idempotent**
(re-running resets the password and re-activates the account) and stores **no secret** —
the username/password come from environment variables at run time.

**Prerequisites**

- V3 applied (`auth` schema + roles).
- `@node-rs/argon2` installed (OpenCode adds it in M1; `tedious` is already a dependency).
- `DB_*` loaded into the session; `DB_USER` must have CRUD on `auth` (that is `ebi_app`).

**Run (PowerShell, from repo root)**

```powershell
# load DB_* from .env
Get-Content .env | Where-Object { $_ -match '^\s*DB_[A-Z_]+\s*=' } | ForEach-Object {
  $n,$v = $_ -split '=',2; Set-Item "env:$($n.Trim())" $v.Trim().Trim('"').Trim("'") }

$env:ADMIN_USERNAME = 'admin'
$env:ADMIN_PASSWORD = '<choose-a-strong-password>'   # not stored anywhere
$env:ADMIN_EMAIL    = 'admin@ezimetales.com'          # optional

node db/seed/bootstrap-admin.mjs

Remove-Item Env:ADMIN_PASSWORD                         # clear the secret from the session
```

The new admin gets `all_plants = 1` (full plant scope) and the `admin` role. Log in once the
portal's M1 is built, then rotate the password from the portal.

> **Hashing caveat:** the script hashes with `@node-rs/argon2` defaults (argon2id). The app
> verifies with the same library and argon2 self-describes its parameters, so custom
> memory/time params still verify. The only thing that breaks verification is a `secret`
> (pepper) in `src/lib/auth/password.ts` — if present, hash with that same secret or just
> reset the admin password from the portal after first login.
