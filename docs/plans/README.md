# Plans index

Approved implementation plans for EBI-Web. Naming: `NNNN-slug.md` (zero-padded sequential).
Plans describe **how** we build something (executable, time-bound); permanent decisions
(the **why**) live as ADRs in [`../architecture/adr/`](../architecture/adr/).

Use `/plan-save` to promote an approved plan into this folder and add its row below.

**This table is the permanent ledger; plan files are not.** A merged plan whose durable
knowledge was extracted (ADRs, module docs, STATE, routing) gets pruned from the working
tree — its row stays, and the full text lives in git history:
`git log --follow --oneline -- "docs/plans/NNNN-*.md"`.

| # | Title | Status | Hook |
|---|---|---|---|
| 0001 | Portal bootstrap | Committed · pruned | Foundations + Power BI admin + roadmap. Live truth moved to STATE (was stale on auth: still said MSAL) |
| 0002 | Portal-owned auth | Committed · pruned | Replace MSAL with username/password (Auth.js v5); roles/plants/departments; defer Power BI → ADR 0001 |
| 0003 | Admin panel restructure | Committed · pruned | Dedicated admin panel: panel sidebar, generic DataTable, modal CRUD, Mi perfil; V4 catalog columns |
| 0004 | [Mantenimiento — CMMS Fase A](0004-mantenimiento.md) | Committed · Fases B–E open | `maint` schema (V5/V6), asset catalog UI, Azure Blob documents (ADR 0002), QR label |
| 0005 | Portal layout & navigation | Committed · pruned | DB-driven topbar/sidebar (V7 nav registry), role-priority visibility, pinnable rail → docs/modules/navigation.md |
| 0006 | [RBAC actions](0006-rbac-actions.md) | Verified | `auth.permission` + `role_permission` (V8); `auth.role` = access profile (`department_id` NULL = transversal); `requirePermission` server-side + `can()` UI; grants panel in /admin/permissions; amendments: nav reactivation (`onRestore`), always-invite UX |
