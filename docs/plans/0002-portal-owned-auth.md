# 0002 — Migrate portal auth from Entra/MSAL to portal-owned credentials

- **Status:** Approved — 2026-06-26
- **Author:** ARamos (planner: Claude Code)
- **Related ADRs:** revises [ADR 0001](../architecture/adr/0001-portal-owned-auth.md) in place (auth login + embed)

> **Execution roles.** Migrations (`db/migrations/`) and the ADR revision are produced by
> Claude (the `dba` sub-agent for SQL/ERD) **after** approval. The application code in
> `src/` is built by OpenCode.

## Context

The portal was bootstrapped assuming it is mainly a Power BI report repository, so login
was tied to **Entra ID (MSAL)** and every user was expected to have an `@ezimetales.com`
M365 account (original ADR 0001).

The short-term vision changed:

1. **Power BI is out of v1** (it returns later, as a dedicated Embedded module).
2. The portal must give a **controlled space to users without an EZI M365 account**
   (clients, plant/operations users), while **keeping the door open** to escalate to
   Power BI Embedded (app-owns-data) later, leveraging capacity-based licensing.

Therefore we migrate the portal to **its own authentication** so the portal becomes the
identity provider. This also fixes a **critical security hole**: today the
`app/api/reports/**` endpoints have **no auth checks at all** (all public).

## Confirmed decisions

| Topic | Decision |
|---|---|
| Auth scope | **Local credentials now**, design ready to add Entra SSO later (SSO not built in v1) |
| Implementation | **Auth.js / NextAuth v5** (Credentials provider) |
| User provisioning | **Admin / invitation only** (no self-registration) |
| User model | **Multi-dimensional**: a user has many **roles**, many **plants** (or `all_plants`), and many **departments** — all admin-managed |
| Power BI in v1 | **Removed entirely** (re-introduced later as Embedded app-owns-data) |

## Scope / out of scope

**In scope**

- Replace MSAL login with Auth.js v5 Credentials (**username + password**).
- New DB schema for users, roles, plants, departments and invitations (Flyway, by `dba`).
- Server-side session + RBAC: middleware route guard, `auth()` access in server components
  and **secured API routes** (close the public hole).
- Admin user-management UI (create users, assign roles/plants/departments, deactivate) +
  plant/department catalog admin + invitation acceptance flow.
- Remove the Power BI embedding layer and SDK dependencies.
- Revise ADR 0001 in place to reflect portal-owned auth + deferred Power BI.

**Out of scope (future)**

- Entra SSO provider (design-compatible, not implemented).
- Power BI Embedded app-owns-data with portal identity (`effectiveIdentity`/`CUSTOMDATA`).
- Self-registration, SCIM/automated provisioning, password-less / MFA.

## Design

### 1. Auth.js v5 core

- `src/auth.ts` — NextAuth config: **Credentials** provider keyed on **`username`**;
  `authorize()` looks up the user by username via Kysely, verifies the password hash,
  rejects inactive users. `callbacks.jwt` embeds `userId`, **`roles[]`** and a
  `tokenVersion`; `callbacks.session` exposes them. The plant/department **scope** is
  *not* baked into the token (it can be large/changing) — it is loaded server-side per
  request via `getUserScope(userId)` (see `rbac.ts`).
  **Session strategy = `jwt`** (mandatory: Auth.js Credentials provider does not support
  DB sessions — see Risks).
- `src/auth.config.ts` — edge-safe subset (no DB/bcrypt imports) consumed by middleware.
- `src/lib/auth/password.ts` — `hashPassword`/`verifyPassword` (argon2id preferred via
  `@node-rs/argon2`; bcrypt acceptable). Hashing runs only in Node runtime, never edge.
- `src/lib/auth/rbac.ts` — authz helpers for API routes and server components:
  `requireUser()`, **`requireAnyRole([...])`** (user may hold several roles), and
  **`getUserScope(userId)`** → `{ allPlants: boolean, plantIds: number[],
  departmentIds: number[] }` for data scoping. Central role enum (`admin`, `viewer` —
  extensible for `client`/`operations`). This scope is the same shape we will later pass to
  Power BI RLS via `effectiveIdentity`/`CUSTOMDATA`.

### 2. Route protection (replaces MSAL templates)

- `src/middleware.ts` (NEW) — uses Auth.js to gate everything under `(portal)` and
  `/api/**` (except auth endpoints); unauthenticated → redirect `/login` (UI) or `401`
  (API). This replaces the client-only `AuthenticatedTemplate`/`UnauthenticatedTemplate`.
- `src/app/(portal)/layout.tsx` — drop MSAL templates; call `auth()` server-side, pass the
  user to `PortalShell`.

### 3. UI & session wiring

- `src/components/providers/msal-provider-wrapper.tsx` → replace with a thin
  `SessionProvider` (`next-auth/react`) wrapper; update `src/app/layout.tsx`.
- `src/components/portal-shell.tsx` — replace `useMsal()`/`accounts[0]` with the session
  (props from server or `useSession()`); logout via `signOut()`.
- `src/components/auth/sign-in-button.tsx` → replace with `login-form.tsx`
  (**username/password** form, EZI brand) calling `signIn('credentials', …)`; update
  `src/app/(auth)/login/page.tsx`.

### 4. Secure existing APIs (critical)

- `src/app/api/reports/route.ts`, `…/[id]/route.ts`, `…/categories/route.ts`,
  `…/categories/[id]/route.ts` — add `requireUser()`; mutations (`POST/PUT/PATCH/DELETE`)
  require `requireAnyRole(['admin'])`. These are public today.

### 5. Admin user management + invitations

- Data access: `src/lib/db/users.ts` (Kysely CRUD for users + their role/plant/department
  assignments + invitations) and `src/lib/db/org.ts` (plant & department catalogs),
  mirroring the existing pattern in `src/lib/db/reports.ts`.
- UI under `src/app/(portal)/admin/users/**` (list, create, deactivate, and **edit
  assignments**: roles multi-select, plants multi-select or "all plants", departments
  multi-select) + `src/app/api/users/**` (admin-guarded).
- Catalog admin for the lookup tables: `src/app/(portal)/admin/plants/**` and
  `admin/departments/**` (+ APIs) so plants/departments are managed from the panel.
- Invitation flow: admin creates the user (inactive, no password) **with the assignments
  already set**, generating a one-time token → `src/app/(auth)/invite/[token]/page.tsx`
  lets the invitee set their password, which activates the account. **If no email service
  exists yet, the admin UI shows a copyable one-time link** (manual delivery) — see
  Risks/open item.

### 6. Remove Power BI from v1

- Delete `src/lib/powerbi/**` and `src/components/powerbi/**`; remove `powerbi-client*` /
  `powerbi-models` deps. The embedded detail (`dashboard-detail.tsx`, embed token hook)
  goes away.
- Convert `src/app/(portal)/dashboards/**` to a placeholder (or hide from nav).
- **Keep** `dbo.report` / `dbo.report_category` tables and their admin CRUD as a **dormant
  catalog** for the future Embedded module (low risk, reversible) — now auth-protected.

### 7. Dependencies / env

- Remove: `@azure/msal-browser`, `@azure/msal-react`, `powerbi-client-react`,
  `powerbi-models`. Add: `next-auth@beta` (v5), `@node-rs/argon2` (or `bcrypt`).
- `.env` / `.env.example`: drop `NEXT_PUBLIC_AZURE_AD_*`, `NEXT_PUBLIC_POWERBI_SCOPE`,
  `NEXT_PUBLIC_EMBED_MODE`. Add `AUTH_SECRET`, `AUTH_URL`. Secrets only in `.env`/Key
  Vault (hard rule #1).

## Migrations / ERD

New migration `db/migrations/V3__auth_schema.sql` (the planner specifies *what*; `dba`
writes the SQL and the ERD). Dedicated `auth` schema for clean least-privilege grants:

- `auth.app_user` — `user_id` PK, `username` (unique, login identifier), `email` (optional,
  for invitation/notification), `display_name`, `password_hash` (nullable until invite
  accepted), `all_plants` (bit; when true the user sees every plant regardless of
  `user_plant` rows), `is_active`, `token_version` (int, for JWT invalidation), audit
  timestamps.
- `auth.role` — `role_id` PK, `name` unique (`admin`, `viewer`, …), description. Seeded.
- `auth.plant` — `plant_id` PK, `code`/`name` unique. Catalog (admin-managed; may later map
  to EPS plant identifiers for ETL/RLS).
- `auth.department` — `department_id` PK, `name` unique. Catalog (admin-managed).
- `auth.user_role` — (`user_id`, `role_id`) composite PK — many-to-many.
- `auth.user_plant` — (`user_id`, `plant_id`) composite PK — many-to-many.
- `auth.user_department` — (`user_id`, `department_id`) composite PK — many-to-many.
- `auth.invitation` — `invitation_id` PK, `user_id` FK (the pre-created inactive user),
  `token_hash`, `expires_at`, `accepted_at`, `created_by`.
- (Optional) `auth.password_reset` — same shape as invitation for resets.
- **No session table** in v1 (JWT strategy).
- Grants: created by `ebi_migrator`; **CRUD granted to `ebi_app`**; read to `ebi_agent_ro`.

After `flyway migrate` on `EBI_dev`, run `/sync-docs` to regenerate
`docs/database/erd.md` + data dictionary. A seed for the first admin user (and the `role`
rows) is required to bootstrap login — provide as a documented one-off script/runbook, not
in the repo with a real secret.

## Roadmap / milestones

1. **M1 — Auth core & security:** `V3` schema + Auth.js config + login form + middleware +
   secure existing report APIs + remove MSAL. (Unblocks safe login; closes the public hole.)
2. **M2 — User management:** `src/lib/db/users.ts`, admin users UI, invitation/accept flow,
   roles/plants/departments enforcement end-to-end.
3. **M3 — Power BI removal:** strip SDK + embed layer, convert dashboards placeholder.
4. **Future:** Entra SSO provider; Power BI Embedded (app-owns-data, capacity-based) using
   `effectiveIdentity`/`CUSTOMDATA` mapped to the portal user.

## Verification

- `pnpm lint && pnpm build` pass.
- `flyway -configFiles=db/flyway.dev.conf migrate` clean; `flyway info` clean; `/sync-docs`
  run and ERD/dictionary updated.
- Seed admin → **log in with username/password**; wrong password and inactive user are
  rejected.
- Unauthenticated request to a `(portal)` route redirects to `/login`; unauthenticated
  `GET /api/reports` returns `401`; non-admin `POST /api/reports` returns `403`.
- Admin creates a user with roles/plants/departments → invite link → invitee sets password
  → can log in with the assigned scope; non-admin cannot reach `/admin/users`.
- `signOut()` ends the session; flipping `is_active=false` / bumping `token_version`
  invalidates existing JWTs on next request.

## Risks / notes

- **Auth.js Credentials ⇒ JWT sessions only** (no DB sessions). Mitigate revocation with a
  short token lifetime + a `token_version` checked in the `jwt` callback (bump to force
  logout); store no sensitive data in the token.
- **No official MSSQL Kysely adapter for Auth.js.** v1 needs no adapter (credentials path
  queries our own `auth.*` tables). When adding Entra SSO, either write a custom MSSQL
  adapter or handle account linking manually — design the schema with this in mind.
- **Closing the public API hole is the security-critical deliverable** — prioritize in M1.
- **Password hashing** must run in the Node runtime only (not edge middleware).
- **Open item (low):** invitation email delivery — if no SMTP/Graph/Resend is wired yet,
  v1 ships the copyable one-time link in the admin UI; confirm preferred channel before M2.
