# ADR 0007 — `org` schema: separate organization from identity

- **Status:** Accepted
- **Date:** 2026-07-07
- **Plan:** [org-schema-plant-process](../../plans/org-schema-plant-process.md)
  (migration V15)
- **Supersedes / relates:** refines the schema layout established by
  [ADR 0004](0004-role-as-access-profile.md) (RBAC as access profiles in
  `auth`); orthogonal to [ADR 0001](0001-portal-owned-auth.md).

## Context

The `auth` schema had grown to hold two different concerns:

1. **Identity & access** — `app_user`, `role`, `permission`, `role_permission`,
   `department`, the `user_*` junctions, `nav_*`, `invitation`. This is what
   `auth` is *for*.
2. **Organization** — `plant`, a catalog of physical sites. A plant is not an
   identity concept; it is *what the company is made of*. Assets belong to
   plants, plants run processes, and (future) the process route and data-scope
   rules key on plants.

Separately, the **process catalog** lived in `maint.process`, framed as
"processes a machine performs". But "Corte láser" is the same real-world object
whether viewed from equipment, from a plant, or from the process route — a
company-wide concept that happened to be born inside the maintenance module.

Keeping organization inside `auth` and the process catalog inside `maint` would
have forced every future organizational feature (process route, plant-scoped
data control, logistics) to either bloat `auth` or duplicate catalogs.

## Decision

Introduce a dedicated **`org`** schema for organization-of-the-company entities,
distinct from identity:

- Move `auth.plant` → **`org.plant`** (canonical plant catalog).
- Promote `maint.process` → **`org.process`** (canonical **company-wide**
  process catalog; `maint.asset_process` keeps linking assets to it
  cross-schema).
- Add **`org.plant_process`** (N:M): which processes each plant runs.

**Deliberately kept in `auth`:** `user_plant`, `department`, `role`. `user_plant`
is an identity-scoping junction (which plants a *user* may see). `department`
and `role` are load-bearing for RBAC (`role.department_id`, `role_permission`,
`role_nav_section`) and moving them would ripple through the permission and nav
systems for no immediate benefit. The line is: **`org` = what the company is
(sites, processes, and how they relate); `auth` = who may act and what they may
do.** Cross-schema FKs (`auth.user_plant.plant_id`, `maint.asset.plant_id`,
`production.{production_line,cell}.plant_id`, `maint.asset_process.process_id`)
are expected and fine — they survive `ALTER SCHEMA TRANSFER` by `object_id`.

Process **administration** moves out of the maintenance module into the admin
panel (Organización group), alongside plants/departments/roles, with permissions
`org.process:{create,update,delete}` and `org.plant_process:assign`. The old
`maintenance.process:*` permissions and the maintenance `Procesos` nav item are
retired.

## Consequences

- **Positive:** one process catalog for the whole company; a clean home for
  future organizational modules (process route, logistics, plant-scoped data
  control) without touching `auth`; the admin panel is the single place to
  govern "what EZI is".
- **Cost:** a coordinated code+DB cutover (every `.withSchema("auth")` /
  `.withSchema("maint")` query for plant/process ships as `.withSchema("org")`
  in the same release — as V12 was for `production`). Cross-schema display
  joins (plant/process names) resolve via a second per-schema query merged in
  JS (the flattened `kysely-codegen` keys can't express a typed cross-schema
  join) — the established pattern (`plantNamesById`, now `processNamesById`).
- **Boundary discipline:** new organizational catalogs default to `org`, not
  `auth` or a business module. If a concept is "what the company is", it is
  `org`; if it is "who may act", it is `auth`; if it is domain workflow, it is
  the module schema (`maint`, `production`, …).

## Alternatives considered

- **Leave `plant` in `auth`, create a separate `org.process`.** Rejected: keeps
  the identity/organization smell and, worse, creates two competing process
  catalogs (maintenance vs org) that drift and force double data entry.
- **Move `department`/`role` to `org` too.** Rejected for now: they are
  entangled with RBAC; the churn (permission gates, nav grants, guards) is large
  and the benefit is cosmetic. Revisit only if a concrete need appears.
