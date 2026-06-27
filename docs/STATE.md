# STATE — live project truth (EBI-Web)

> **Always-loaded digest.** This file holds only what is *true now*: the active milestone,
> live decisions, the DB-user matrix and the file-layout map. It exists so agents stop
> re-reading the 139-line master plan for facts. **Rationale, history, alternatives and risks
> live elsewhere** (see *Where the history lives* at the bottom) — read those only on demand.
>
> Keep this ≤ ~50 lines. When a decision changes, edit *this* file first, then the plan/ADR.

## Active focus

- **Milestone 1 — Report admin portal** (auth + admin + dashboards placeholder). Power BI
  embedding is **deferred from v1** (placeholder only).
- Branch convention: `feat/m{n}-<slug>`.

## Live decisions (current truth — supersedes the master plan where they differ)

| Topic | Current decision |
|---|---|
| Portal login | **Portal-owned credentials** (username/password, Auth.js v5). *Not* MSAL — superseded by [ADR 0001](architecture/adr/0001-portal-owned-auth.md). Open to add Entra SSO later. |
| Power BI | **Embedding deferred** in v1 (dashboards are a placeholder). Layer `src/lib/powerbi/` stays mode-agnostic (`Aad` dev / `Embed` prod) for when it returns. |
| App stack | Next.js App Router + TS + **pnpm** (never npm/yarn). Tailwind + shadcn/ui. |
| Data access | **Kysely** only, inside `src/lib/db/`. No raw queries elsewhere. Types via `kysely-codegen`. |
| Migrations | **Flyway** pure SQL in `db/migrations/` (`V{n}__`/`R__`). Written by the `dba` sub-agent; a human runs `flyway migrate`. |
| Databases | Dev `EBI_dev` → Prod `EBI`. Validate in dev before prod. |
| Schemas | Medallion: `staging` (ETL landing) → `core`/`planeacion` (consumption). |
| ETL | EPS is **read-only**. Never write to EPS. |

## DB users (least privilege)

| User | Use |
|---|---|
| `ebi_agent_ro` | read-only introspection / ERD (MCP `ebi-sql-dev`) |
| `ebi_migrator` | DDL via Flyway |
| `ebi_app` | CRUD at app runtime (Managed Identity in prod) |

## File-layout map

- `src/app/` — UI + API routes (App Router).
- `src/lib/db/` — typed Kysely access (only place for queries).
- `src/lib/powerbi/` — mode-agnostic embed layer (token acquisition forks, not the component).
- `db/migrations/` — Flyway SQL (authored by `dba`).
- `docs/plans/` · `docs/architecture/adr/` · `docs/modules/` · `docs/database/`.

## Where the history lives (read on demand, not every session)

- **Master plan + roadmap + risks:** [docs/plans/0001-portal-bootstrap.md](plans/0001-portal-bootstrap.md).
- **Auth rationale (MSAL → portal-owned):** [ADR 0001](architecture/adr/0001-portal-owned-auth.md).
- **Architecture diagram + env matrix:** [docs/architecture/overview.md](architecture/overview.md).
- **DB current shape:** `docs/database/{erd,data-dictionary,migrations-log}.md`.
- **Rules of engagement:** [AGENTS.md](../AGENTS.md).
