# Module blueprint — the recipe for stamping a portal module

> **Living document.** The step-by-step pattern every new module follows, so each one
> costs less than the previous. `/plan-module` should consult it; every closed plan that
> changes the pattern updates it. Rationale: [ADR 0003](adr/0003-composition-over-metadata.md).
>
> Status legend: ✅ exists today · 🔜 planned (foundational plans pending).

## 1. Schema (✅ pattern proven by `maint`)

- Own SQL schema per module (`maint`, `production`, future `quality`... —
  English schema names since V12), Flyway migrations produced by the `dba`
  sub-agent.
- Real constraints, not app-side checks alone: named CHECKs for enumerations, computed
  columns for folios, append-only ledgers where history matters.
- The module's migration **seeds its own registry rows**: its `nav_section` (+ items,
  `is_active = 0` for dark launch) and — once RBAC actions exist — its permission rows.

## 2. Data layer (✅ pattern proven)

- `src/modules/<module>/db.ts` (or `db/` when it grows — one file per
  aggregate, `org` and `production` are the reference examples) importing its
  per-schema client from `src/lib/db/schema-clients.ts` (single home for
  `authDb`/`orgDb`/`maintDb`/`productionDb` + `emptyToNull`; a module that
  needs a schema not yet listed there adds it in that one file, not with a
  local `rootDb.withSchema(...)` call). Cross-schema ref lookups shared by
  more than one module (location/process/asset identity) live in
  `src/lib/db/refs.ts`. SQL lives only in `src/lib/db/` (infra: client +
  generated types + these two shared-plumbing files) and
  `src/modules/*/db{.ts,/*.ts}`.
- Kysely only; types regenerated with `pnpm db:gen` after every migration.
- MSSQL inserts via `.output("inserted.<pk>")`; transactions inherit the bound schema.

## 3. Authorization (✅ built in plan 0006 — ADR 0004)

- `auth.permission` (`<module>.<resource>:<action>`) + `role_permission`, seeded by
  module migrations (V8 seeded org/reports/navigation/maintenance retroactively).
  The grant subject is the **access profile**: `auth.role` + optional
  `department_id` (NULL = cross-department). No per-user overrides in v1.
- Server: `requirePermission(...)` in every mutation API route (GETs stay on
  `requireUser`/admin in v1). Client: `useCan()` hook (PermissionsProvider, seeded
  server-side in the portal layout) to show/hide actions. The protected `admin`
  role bypasses grants (same app-layer rule as nav). Grants panel:
  `/admin/portal/permissions`. Live doc: `docs/modules/rbac.md`.

## 4. Resource definitions + UI kit (🔜 plan: resource definitions · ✅ kit relocated 2026-07-02)

- `src/modules/<module>/resources/<entity>.ts` (🔜): columns, form fields, Zod
  validation, required permissions, endpoints — typed against the generated Kysely types.
- Kit components in `src/components/kit/` consume them: `ResourceTable` (evolves from the
  generic `DataTable`, already living in `kit/`), `ResourceForm` / `entity-form-dialog`,
  detail page; later `Calendar`, `Kanban`, `KpiCard` as modules demand them (0004 Fase B
  needs the calendar).
- A standard CRUD screen = resource definition + composition (~30 lines). Screens with
  domain logic (kardex, plant map) are hand-built — do not force them into the kit.

## 5. Navigation + page authorization (✅ nav in plan 0005 · page authz in plan portal-home-nav-authz — ADR 0005)

- Section **and its items** seeded by the module migration (V9 backfilled `maintenance`);
  admins edit label/icon/order/active *and* role grants + topbar priority from the
  single unified screen `/admin/portal/permissions` (`PermissionManager`'s "Estructura
  del menú" panel — the separate Módulos tab/route was retired), never creating routes.
- **Every module adds a segment guard** `src/app/(portal)/<module>/layout.tsx` calling
  `requireSectionOrRedirect("<section-code>")` (`src/modules/navigation/guard.ts`). This
  makes the section grant *authorize the page*, not just paint the rail (ADR 0005): a
  user without the grant is redirected to `/`. The guard reuses the cached nav
  resolution, so admin bypass and inactive-section rules come for free. Omitting it
  leaves the pages reachable by any authenticated user — it is a required step.

## 6. Documentation per module

- `docs/modules/<module>.md` from `_module-template.md`.
- A routing row in `docs/docs-routing.md` (read-always / read-if / skip / gotchas).
- ERD pages regenerate via the `docs-sync` sub-agent at the end of the build phase
  (`/ship-module` or `/build-plan`).

## Stamping order for a new module

1. Plan (`/ship-module` fast lane, or `/plan-module` full lane; both consult this
   blueprint + routing row of the closest module type). On approval the skill persists
   the plan, creates the migrations (schema + nav/permission seeds) and applies them to
   `EBI_dev` (`flyway migrate` + `pnpm db:gen`).
2. Build (`/ship-module` continues; full lane runs `/build-plan`): one new folder
   `src/modules/<module>/` (db → resources → components) + thin routes in `src/app/` +
   namespaced API (`/api/<module>/...`) → custom screens. Ends with the verification
   phase (tests + amendments).
3. `/commit-plan`. Activate the section from `/admin/portal/permissions` when ready.
