# Module blueprint — the recipe for stamping a portal module

> **Living document.** The step-by-step pattern every new module follows, so each one
> costs less than the previous. `/plan-module` should consult it; every closed plan that
> changes the pattern updates it. Rationale: [ADR 0003](adr/0003-composition-over-metadata.md).
>
> Status legend: ✅ exists today · 🔜 planned (foundational plans pending).

## 1. Schema (✅ pattern proven by `maint`)

- Own SQL schema per module (`maint`, future `calidad`, `produccion`...), Flyway
  migrations produced by the `dba` sub-agent.
- Real constraints, not app-side checks alone: named CHECKs for enumerations, computed
  columns for folios, append-only ledgers where history matters.
- The module's migration **seeds its own registry rows**: its `nav_section` (+ items,
  `is_active = 0` for dark launch) and — once RBAC actions exist — its permission rows.

## 2. Data layer (✅ pattern proven)

- `src/modules/<module>/db.ts` (or `db/` when it grows) binding
  `rootDb.withSchema("<module>")` at the top. SQL lives only there and in
  `src/lib/db/` (infra: client + generated types).
- Kysely only; types regenerated with `pnpm db:gen` after every migration.
- MSSQL inserts via `.output("inserted.<pk>")`; transactions inherit the bound schema.

## 3. Authorization (🔜 plan: RBAC actions)

- `auth.permission` (`<module>.<resource>:<action>`) + `role_permission`
  (+ optional per-user overrides), seeded by module migrations.
- Server: `requirePermission(...)` in every API route. Client: `can(...)` hook consumed
  by kit components to show/hide actions. The protected `admin` role bypasses grants
  (same app-layer rule as nav).

## 4. Resource definitions + UI kit (🔜 plan: resource definitions · ✅ kit relocated 2026-07-02)

- `src/modules/<module>/resources/<entity>.ts` (🔜): columns, form fields, Zod
  validation, required permissions, endpoints — typed against the generated Kysely types.
- Kit components in `src/components/kit/` consume them: `ResourceTable` (evolves from the
  generic `DataTable`, already living in `kit/`), `ResourceForm` / `entity-form-dialog`,
  detail page; later `Calendar`, `Kanban`, `KpiCard` as modules demand them (0004 Fase B
  needs the calendar).
- A standard CRUD screen = resource definition + composition (~30 lines). Screens with
  domain logic (kardex, plant map) are hand-built — do not force them into the kit.

## 5. Navigation (✅ built in plan 0005)

- Section seeded by the module migration; admin edits label/icon/order/active/grants in
  `/admin/access`, never creates routes.

## 6. Documentation per module

- `docs/modules/<module>.md` from `_module-template.md`.
- A routing row in `docs/docs-routing.md` (read-always / read-if / skip / gotchas).
- ERD pages regenerate via the `docs-sync` sub-agent at the end of `/build-plan`.

## Stamping order for a new module

1. `/plan-module` (consults this blueprint + routing row of the closest module type).
2. `/plan-save` → migrations (schema + nav/permission seeds).
3. Human: `flyway migrate` + `pnpm db:gen`.
4. `/build-plan`: one new folder `src/modules/<module>/` (db → resources → components) +
   thin routes in `src/app/` + namespaced API (`/api/<module>/...`) → custom screens.
5. `/verify-plan` → `/commit-plan`. Activate the section in `/admin/access` when ready.
