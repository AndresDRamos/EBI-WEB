# Plans index

Approved implementation plans for EBI-Web. Naming: `slug.md` (kebab-case, no number —
the slug is the plan's identity). Plans describe **how** we build something (executable,
time-bound); permanent decisions (the **why**) live as ADRs in
[`../architecture/adr/`](../architecture/adr/).

Approved plans land here automatically — `/ship-module` or `/plan-module` persists the
plan and adds its row below right after the human approves it.
**Never reuse a ledger slug**: if a new plan would take a name already in the table,
pick a more specific slug — `git log --follow` must never conflate two plans under one
filename.

**This table is the permanent ledger; plan files are not.** When a plan's PR merges,
the plan file is pruned from `main` in an automatic cleanup commit (see `/commit-plan`)
— merges are squash, so the file must survive *through* the merge and be deleted
*after* it, or its text never reaches history. Its row stays, and the full text lives
in git history: `git log --follow --oneline -- "docs/plans/<slug>.md"`. Only in-flight
plans and plans with open phases remain in the working tree.

Rows are chronological; plans up to `portal-home-nav-authz` predate this convention and
were numbered `0001–0007` (filenames in history keep the prefix).

| Date | Title | Status | Hook |
|---|---|---|---|
| 2026-06-24 | Portal bootstrap | Committed · pruned | Foundations + Power BI admin + roadmap. Live truth moved to STATE (was stale on auth: still said MSAL) |
| 2026-06-26 | Portal-owned auth | Committed · pruned | Replace MSAL with username/password (Auth.js v5); roles/plants/departments; defer Power BI → ADR 0001 |
| 2026-06-27 | Admin panel restructure | Committed · pruned | Dedicated admin panel: panel sidebar, generic DataTable, modal CRUD, Mi perfil; V4 catalog columns |
| 2026-07-02 | Mantenimiento — CMMS Fase A | Committed · pruned (Fases B–E roadmap lives in git history) | `maint` schema (V5/V6), asset catalog UI, Azure Blob documents (ADR 0002), QR label |
| 2026-07-02 | Portal layout & navigation | Committed · pruned | DB-driven topbar/sidebar (V7 nav registry), role-priority visibility, pinnable rail → docs/modules/navigation.md |
| 2026-07-03 | RBAC actions | Committed · pruned | `auth.permission` + `role_permission` (V8); `auth.role` = access profile (`department_id` NULL = transversal); `requirePermission` server-side + `can()` UI; grants panel in /admin/permissions; amendments: nav reactivation (`onRestore`), always-invite UX |
| 2026-07-03 | Portal home & nav authz | Committed · pruned | Section grants authorize pages (segment-layout guard `requireSectionOrRedirect`, ADR 0005); home at `/` replaces `/dashboards`; Power BI code purged; `PortalSidebar` for portal + admin; V9 seeds maintenance nav items |
| 2026-07-03 | [Admin panel regroup](admin-panel-regroup.md) | Committed | Admin panel → 2 tabbed groups (Organización / Portal, tabs as real routes); kit `PageTabs` + `GroupedDataTable`; roles grouped inside departments (admin can hold a department — guard relaxed); permission matrix resource × action; old `/admin/*` routes redirect |
| 2026-07-03 | [Production cells & temporal asset assignment](production-cell-assignment.md) | Committed | `produccion` schema (V11): `production_line` → `cell` (nullable line + op sequence) + temporal `asset_cell_assignment` (M:N historized — replaces free-text `maint.asset.location` as truth); `maint.asset.asset_category`; nav section `production` dark-launched + 6 permission codes; foundation for the future APS |
| 2026-07-05 | [Split data dictionary per schema](split-data-dictionary.md) | Committed | Docs-only: monolithic `docs/database/data-dictionary.md` → `docs/database/dictionary/_index.md` + per-schema pages (mirrors `erd/`); routing/STATE/db-README/agent references updated; grounded in the 2026-07-04 `/trace-map` audit |
| 2026-07-06 | [Rename schema produccion → production](production-schema-rename.md) | Committed | English DB naming convention: V12 `ALTER SCHEMA TRANSFER` of the 3 V11 tables + re-issued schema grants + drop `produccion`; `withSchema("production")` in `modules/production/db.ts`; erd/dictionary pages renamed |
| 2026-07-06 | [Plant layout digitization — foundation](plant-layout-foundation.md) | Committed | `production` layouts (V13): versioned immutable `plant_layout` (one active per plant), `asset_footprint` (dxf \| rectangle), temporal `asset_placement` (close+insert, carry-forward on activation); pure DXF pipeline (`dxf/`, CAD contract, ADR 0006) grounded in plant 7's real DXF analysis; re-scoped (V14) to dark-park the UI under the admin-only `/test/*` proving ground — not yet in the portal nav |
| 2026-07-07 | [Org schema: plant + unified process + plant↔process](org-schema-plant-process.md) | Approved | New `org` schema (V15): `ALTER SCHEMA TRANSFER` of `auth.plant`→`org.plant` and `maint.process`→`org.process` (unifies the process catalog company-wide), + N:M `org.plant_process` ("which plant runs which process"); process admin moves to the admin panel (Organización) with `org.process:*` / `org.plant_process:assign` perms, retires `maintenance.process:*` + the maintenance `Procesos` nav item; identity/RBAC (`user_plant`, `department`, `role`) stays in `auth` → ADR 0007 |
| 2026-07-08 | [Admin permissions portal — page-granular nav authz](admin-permissions-portal.md) | Committed | Nav authorization drops from section to **page** (V16 `auth.role_nav_item`, backfilled from `role_nav_section`): a section is derived-visible (≥1 visible page), `role_nav_section` narrows to per-role section order. Unified top filter (Rol ⇄ Usuario) drives both panels; per-role page drag-order; icon preview in dialogs; ungranted sections sink; scoped scroll + collapsed modules. Guard goes page-level via `x-pathname` middleware header → ADR 0008 supersedes 0005 |
