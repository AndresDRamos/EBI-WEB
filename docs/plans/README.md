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
| 2026-07-03 | [Portal home & nav authz](portal-home-nav-authz.md) | Approved | Section grants authorize pages (segment-layout guard `requireSectionOrRedirect`, ADR 0005); home at `/` replaces `/dashboards`; Power BI code purged; `PortalSidebar` for portal + admin; V9 seeds maintenance nav items |
