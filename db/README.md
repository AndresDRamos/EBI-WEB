# Database migrations (Flyway)

How to apply the SQL migrations in [`migrations/`](migrations/) to Azure SQL. Migrations are
**pure versioned SQL** written by the `dba` sub-agent; a human (you) runs them and validates.

> **Golden rule:** apply and validate in **`EBI_dev`** first. Production (`EBI`) is changed
> **only** through the gated CI/CD job — never ad‑hoc from your machine.

## Layout

| File | Purpose | In git? |
|---|---|---|
| `migrations/V{n}__{desc}.sql` | Versioned migration, applied once, in order | yes |
| `migrations/R__{desc}.sql` | Repeatable migration, re-applied when its checksum changes | yes |
| `flyway.dev.conf` | Dev connection (URL, user `ebi_migrator`, locations). **No password.** | yes |
| `flyway.dev.conf.local` | Your local secret: `flyway.password=...` for dev | **no (gitignored)** |
| `flyway.prod.conf` | Prod connection. Password comes from CI/Key Vault, never a file | yes |
| `seed/` | One-off seed scripts (e.g. bootstrap admin) — not run by Flyway | yes |

## Prerequisites

- **Flyway CLI** on PATH (installed via scoop here: `flyway version` → *Flyway OSS 12.x*).
- **`db/flyway.dev.conf.local`** exists and contains the `ebi_migrator` dev password:
  ```
  flyway.password=<dev password for ebi_migrator>
  ```
  This file is gitignored — keep the secret out of every committed file.
- Network access to the Azure SQL host (it is **serverless**; the first connection may take
  a few seconds to wake the database — see Troubleshooting).

## Running migrations (dev)

Run from the **repository root** in **PowerShell**:

```powershell
# 1) Preview — shows each migration's state (the new one should be "Pending")
flyway --% -configFiles=db/flyway.dev.conf,db/flyway.dev.conf.local info

# 2) Apply all pending migrations
flyway --% -configFiles=db/flyway.dev.conf,db/flyway.dev.conf.local migrate

# 3) Confirm — the migration should now be "Success"
flyway --% -configFiles=db/flyway.dev.conf,db/flyway.dev.conf.local info
```

Optional integrity check (validates applied checksums against the files):

```powershell
flyway --% -configFiles=db/flyway.dev.conf,db/flyway.dev.conf.local validate
```

### Two things that WILL bite you (learned the hard way)

1. **The `--%` token is required in PowerShell.** Without it PowerShell mangles the argument
   and splits `flyway.dev.conf` at the dot, giving `ERROR: Invalid flag: .dev.conf`. The
   `--%` (stop‑parsing) token tells PowerShell to pass the rest of the line verbatim to
   Flyway. (In `cmd.exe`/CI bash you don't need it.)
2. **You must pass BOTH config files.** Flyway does **not** auto-load the `.local` sibling.
   If you pass only `flyway.dev.conf`, no password is supplied and you get
   `Login failed for user 'ebi_migrator'` (error 18456). List `flyway.dev.conf.local`
   **last** so its `flyway.password` wins.

> Tip: drop this function in your PowerShell `$PROFILE` to avoid retyping:
> ```powershell
> function fwdev { flyway -configFiles=db/flyway.dev.conf,db/flyway.dev.conf.local @args }
> # usage: fwdev info   |   fwdev migrate   |   fwdev validate
> ```
> (A defined function doesn't need `--%`, because there's no dotted literal on the command line.)

## After a successful migration

### 1. Regenerate the Kysely types

So Kysely sees the new tables, regenerate `src/lib/db/types.ts`. In theory:

```powershell
pnpm db:gen
```

…but `pnpm db:gen` relies on the shell expanding `${DB_SERVER}` etc., which **PowerShell /
cmd.exe do not do** (only a POSIX shell like Git Bash does). On Windows, run this instead —
it loads `DB_*` from `.env` into the session and calls the generator directly:

```powershell
# load DB_* from .env into this PowerShell session
Get-Content .env | Where-Object { $_ -match '^\s*DB_[A-Z_]+\s*=' } | ForEach-Object {
  $name, $val = $_ -split '=', 2
  Set-Item -Path "env:$($name.Trim())" -Value $val.Trim().Trim('"').Trim("'")
}

# generate the types (ADO.NET connection string — the format kysely-codegen 0.18.x needs)
pnpm exec kysely-codegen --dialect mssql --out-file src/lib/db/types.ts `
  --url "Server=$env:DB_SERVER,1433;Database=$env:DB_DATABASE;User Id=$env:DB_USER;Password=$env:DB_PASSWORD"
```

Notes / things that bit us:
- **Connection string must be ADO.NET style** (`Server=...;Database=...;User Id=...;Password=...`),
  **not** a `mssql://user:pass@host/db` URI — this version of `kysely-codegen` parses it with
  `@tediousjs/connection-string`, and a URI yields `server=undefined` → `Cannot read
  properties of undefined (reading 'split')`. (The `db:gen` script was fixed to this format.)
- **Two extra dev deps are required** for the mssql dialect and are pinned in `package.json`:
  `@tediousjs/connection-string@^0.5.0` (the `0.18.x` codegen needs the `0.5.x` API — newer
  majors drop `parseConnectionString`) and `tedious`.
- If your password contains `;`, `=` or quotes, wrap it: `...;Password='$env:DB_PASSWORD'`.
- Introspection is read-only; you can use `ebi_agent_ro` instead of `DB_USER` if you prefer.

### 2. Refresh the living docs

Regenerate the ERD, data dictionary and migrations log from the real schema: run
`/sync-docs` (Claude). Do **not** hand-edit `docs/database/erd/` /
`docs/database/dictionary/` (per-schema pages + `_index.md`) /
`migrations-log.md` — they are generated.

## Production (reference only)

Do **not** run this yourself. Prod migrations go through the gated CI/CD job, which supplies
the password via `FLYWAY_PASSWORD` from Key Vault:

```bash
flyway -configFiles=db/flyway.prod.conf migrate   # CI/CD only, after dev is validated
```

## Conventions

- **Never edit an already-applied `V{n}` migration** — its checksum is recorded; change it
  and `validate`/`migrate` will fail. Fix-forward with a new `V{n+1}`.
- **Numbering is sequential and zero-gap by convention** (`V1`, `V2`, `V3`, …).
- **Migrations are authored by the `dba` sub-agent**, not by hand. You run and validate.
- **Secrets never in the repo** — only in `flyway.dev.conf.local` (gitignored) or Key Vault.
- **Least privilege:** `ebi_migrator` runs DDL (migrations); `ebi_app` is the app runtime
  user; `ebi_agent_ro` is read-only for introspection.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERROR: Invalid flag: .dev.conf` | PowerShell split the argument at the dot | Add `--%` after `flyway` (or use the `fwdev` function) |
| `Login failed for user 'ebi_migrator'` (18456) | The `.local` config (password) wasn't passed | Pass **both** config files, `.local` last |
| `Host desconocido (servereps...)` / `UnknownHostException` | Serverless DB asleep / transient DNS while the gateway wakes | Retry after a few seconds; verify network/firewall to port 1433 |
| `validate` fails after editing a migration | You changed an already-applied file | Revert the file; fix-forward with a new `V{n+1}` |
| Migration skipped the `GRANT` for `ebi_app`/`ebi_agent_ro` | Those principals didn't exist at run time (guarded grant) | Create the principals, then run the grants from the plan's runbook |
| `db:gen`: `Cannot find module '@tediousjs/connection-string'` | mssql dialect dep not installed (pnpm strict node_modules) | `pnpm add -D @tediousjs/connection-string@0.5.0` |
| `db:gen`: `parseConnectionString is not a function` | Installed the wrong major (1.x); codegen `0.18.x` needs `0.5.x` | Pin `@tediousjs/connection-string@^0.5.0` |
| `db:gen`: `Cannot read properties of undefined (reading 'split')` | URI connection string (`mssql://…`) instead of ADO.NET, or `${DB_*}` not expanded by the shell | Use the ADO.NET `--url` and load `DB_*` in PowerShell (see *After a successful migration*) |
