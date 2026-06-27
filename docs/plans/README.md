# Plans index

Approved implementation plans for EBI-Web. Naming: `NNNN-slug.md` (zero-padded sequential).
Plans describe **how** we build something (executable, time-bound); permanent decisions
(the **why**) live as ADRs in [`../architecture/adr/`](../architecture/adr/).

Use `/save-plan` to promote an approved plan into this folder and add its row below.

| # | Title | Status | Hook |
|---|---|---|---|
| 0001 | [Portal bootstrap](0001-portal-bootstrap.md) | Approved | Foundations + Power BI admin + Planning/ETL + production roadmap |
| 0002 | [Portal-owned auth](0002-portal-owned-auth.md) | Approved | Replace MSAL with username/password (Auth.js v5); roles/plants/departments; defer Power BI |
| 0003 | [Admin panel restructure](0003-admin-panel-restructure.md) | Approved | Dedicated admin panel: avatar dropdown, panel sidebar, generic DataTable, modal CRUD, Mi perfil; V4 catalog columns |
