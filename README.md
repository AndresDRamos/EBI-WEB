# EBI-Web — EZI Business Intelligence internal portal

Internal portal that administers the business from a single place: Power BI reports
(embedding + drill-through), operational modules (Mantenimiento CMMS today; Calidad,
Producción, Planeación next) and the EPS→EBI data pipeline. Built module-by-module by
an agent-driven workflow (plans → build → verify → commit).

## New here? Read in this order

1. **Open [`EBI-Web.code-workspace`](EBI-Web.code-workspace)** in VS Code
   (*File → Open Workspace from File*) — the explorer roots are ordered by review flow:
   docs → agent config → migrations → `src` by information flow.
2. [`docs/STATE.md`](docs/STATE.md) — the live truth: active focus, decisions, code
   conventions, file-by-file map. Always current; start every task here.
3. [`AGENTS.md`](AGENTS.md) — the rules of engagement (also loaded by the AI agents).
4. [`docs/architecture/module-blueprint.md`](docs/architecture/module-blueprint.md) —
   how a module is stamped. ADRs in [`docs/architecture/adr/`](docs/architecture/adr/)
   hold the permanent *why*.

## Stack

- **App:** Next.js (App Router) + TypeScript · **pnpm** (never npm/yarn) ·
  Tailwind + shadcn/ui · EZI identity (charcoal `#373a36`, orange `#ff5c35`, Montserrat).
- **Auth:** portal-owned credentials (Auth.js v5) — see ADR 0001. Entra SSO stays open
  as a future addition.
- **Data:** Azure SQL (`EBI_dev` dev / `EBI` prod) · **Kysely** typed access ·
  **Flyway** migrations (pure SQL in `db/migrations/`).
- **Power BI:** `powerbi-client-react`; embedding deferred in v1, `src/lib/powerbi/`
  stays mode-agnostic.

## Getting started (development)

```bash
pnpm install
git config core.hooksPath .githooks               # enables the no-direct-push-to-main guard
cp .env.example .env                              # fill values (never commit them)
flyway -configFiles=db/flyway.dev.conf migrate    # apply migrations to EBI_dev
pnpm db:gen                                       # regenerate Kysely types
pnpm dev                                          # http://localhost:3001
```

## Repo structure (modules-first)

| Path | Contents |
|---|---|
| `src/app/` | **Thin routing only** — pages and API handlers compose from modules |
| `src/modules/<m>/` | One folder per domain (`org`, `reports`, `navigation`, `maintenance`): its `db` (only place with that schema's SQL) + `components` |
| `src/components/kit/` | Stampable generics (DataTable, form dialog…) — never domain-aware |
| `src/components/{layout,ui,providers}/` | Global chrome · shadcn primitives · providers |
| `src/lib/` | Domain-blind infra: db client + generated types, auth helpers, storage |
| `db/migrations/` | Flyway versioned SQL (`V{n}__desc.sql`) |
| `docs/` | STATE, plans, ADRs, module docs, ERD per schema, doc routing |
| `prompts/` | Ephemeral executor prompts per plan (deleted when the plan's branch closes) |

Dependency direction: `app → modules → kit/ui/lib` — never the reverse.

## Workflow (plan-driven)

1. Drop the raw ask in `prompts/<slug>.md` and run `/plan-module <slug>` → the
   skill validates the slug against the ledger (never reused) and produces
   `docs/plans/<slug>.md` (invoking the `dba` sub-agent if the schema changes).
   Human approves.
2. `/plan-save` → persists plan + migration files + executor prompt (`prompts/<slug>.md`).
3. Human: `flyway migrate` against `EBI_dev` + `pnpm db:gen`.
4. `/build-plan` → code; `docs-sync` reconciles docs at the end.
5. `/verify-plan` → tests + check against the plan's objective.
6. `/commit-plan` → atomic Conventional Commits (in Spanish) → push → **Pull Request**.

## Git conventions

### Branches

- `main` is protected: changes arrive **only by PR** with CI green. Trunk-based,
  short-lived branches (days, not weeks). Server-side branch protection needs GitHub
  Pro/Team on private repos; until then the committed `.githooks/pre-push` guard
  enforces it per clone (see *Getting started*).
- Name: `<type>/<slug>` where `type` ∈ `feat|fix|refactor|docs|chore` —
  e.g. `feat/rbac-actions`. The slug matches the plan's slug when the branch
  implements a plan.
- **Plans are not numbered — the slug is the identity.** `/plan-module` checks the
  ledger (`docs/plans/README.md`) **on `origin/main`**: if the slug was ever used,
  the new plan takes a more specific one. Two in-flight plans can't collide because
  distinct work gets distinct names.

### Commits and PRs

- Conventional Commits, **in Spanish**, atomic (one concern per commit).
- PR title in Conventional Commits (it becomes the squash-merge message). Fill the
  template: plan link, what changed, verification, out of scope.
- CI (`.github/workflows/ci.yml`) gates every PR: `pnpm lint`, `pnpm build`, and
  uniqueness of Flyway versions.

### Plan lifecycle (keep `docs/plans/` lean)

Plans are **working artifacts, not permanent history** — git history is the archive:

- A plan lives in `docs/plans/` while it is in flight (`draft → … → committed`) or
  still carries roadmap (open phases, like Mantenimiento's Fases B–E).
- When a plan's PR merges, `/commit-plan` **prunes the plan file automatically** in a
  cleanup commit (extracting any remaining durable knowledge — ADRs, module docs,
  `STATE.md`, `docs-routing` — first). The plan must survive *through* the squash
  merge and be deleted *after* it, or its text never reaches `main`'s history. Its
  one-line row in `docs/plans/README.md` is the permanent ledger (date, title, hook).
- `prompts/<slug>.md` is ephemeral: it exists only on the plan's branch and is removed
  in the plan's final commit — it never reaches `main`.

### Migrations (Flyway numbering)

- Version numbers are **sequential integers claimed against `main`**: before
  `/plan-save`, check the highest `V{n}` on `origin/main` (and
  `docs/database/migrations-log.md`).
- If `main` gained your number while your PR was open: rename your migration to the
  next free version **before merging** (CI fails on duplicates as a safety net). Never
  renumber a migration that was already applied to a shared database — repair forward
  with a new version instead.
- Prefer **one migration-bearing plan in flight at a time**: `EBI_dev` is shared, so
  parallel schema work needs explicit coordination.
- Never edit an applied migration; always add a new `V{n}`. A human runs
  `flyway migrate` (dev first, prod only after validation — `EBI_dev` → `EBI`).

## Security

- Secrets only in `.env` (gitignored) / Azure Key Vault — **never** in the repo.
- Least-privilege DB users: `ebi_agent_ro` (introspection) / `ebi_migrator` (DDL) /
  `ebi_app` (runtime CRUD).
- The EPS manufacturing database is **read-only** for the ETL. No exceptions.
- No "Publish to web": the authenticated portal replaces public URLs.
