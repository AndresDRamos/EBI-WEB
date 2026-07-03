# ADR 0003 — Portal configurability by composition, not metadata

- **Status:** accepted (2026-07-02)
- **Plan:** none (strategy session 2026-07-02; feeds the upcoming RBAC-actions and UI-kit plans)

## Context

As modules multiply (Mantenimiento today; Calidad, Producción, Planeación next), most
screens converge on the same shapes: catalogs, CRUD tables, detail pages, role-gated
actions. The tempting shortcut is a runtime "portal builder": model entities, pages and
relations from the portal itself (SAP-style), storing business data in generic
metadata tables.

That path was evaluated and rejected. It leads to the inner-platform effect: business
data degrades into EAV structures that break the project's core assets — the typed
Kysely layer, Flyway-versioned DDL with real constraints (CHECKs, computed columns,
append-only ledgers as in `maint`), and direct Power BI consumption of a clean
relational model. The hard 20% of manufacturing control (state machines, folios,
stock ledgers) cannot be expressed by a generic builder anyway.

The speed the builder promises is obtained instead at **design time**: the agent
pipeline (`/ship-module`, or `/plan-module` → `/build-plan` → `/commit-plan` in the
full lane) stamps a well-defined module pattern, and each stamped module sharpens
the pattern for the next one.

## Decision

Split configurability by layer:

- **Configured in the database, editable from the admin panel** (composition, no domain
  logic): the navigation registry (`nav_section` / `nav_item` / grants — ADR-less,
  built in plan 0005), role → section visibility and ordering, the upcoming
  **action-level permissions** (resource+action grants per role, seeded by module
  migrations like nav sections are), and dashboard/report composition.
- **Defined in code, versioned in git** (never in metadata tables): every module's SQL
  schema (own schema name, Flyway migrations, real constraints), domain logic, routes
  and pages, and **resource definitions** — one typed file per entity (columns, forms,
  validation, required permissions) consumed by generic kit components
  (`ResourceTable`, `ResourceForm`, detail views), typed against the generated Kysely
  types so schema drift fails the build.
- **Never:** EAV/generic-entity tables for business data; admin-created routes or
  entities at runtime; forking per-module copies of kit components instead of extending
  the kit.

The module recipe that operationalizes this lives in
[`docs/architecture/module-blueprint.md`](../module-blueprint.md).

## Consequences

- Two foundational plans precede the next business module: **RBAC actions**
  (`auth.permission` + `role_permission`, `requirePermission` server-side, `can()` in
  the UI) and **UI kit extraction** (move the generic `DataTable` out of
  `components/admin/` into a shared kit; introduce resource definitions).
- ~80% of future screens (catalogs/CRUD) become declaration + composition; the
  domain-specific 20% (WO calendar, kardex, plant map) stays hand-built without
  fighting a framework.
- Power BI keeps reading real relational schemas; no BI rework.
- The measure of success is per-module cost trending down (Calidad should cost a
  fraction of Mantenimiento), not "pages without programming".
