# ADR 0001 — Portal-owned authentication (username/password); Power BI deferred

> **Revised 2026-06-26** — replaces the original decision *"Entra ID for portal login; Power
> BI embed via service principal in production"*, which was never implemented (MSAL existed
> only client-side; the embed layer was a stub). Edited in place rather than superseded
> because there was no realized decision history to preserve.

- **Status:** Accepted — 2026-06-26
- **Context plan:** [0002 — Portal-owned auth](../../plans/0002-portal-owned-auth.md)
  (revises the original decision from [0001 — Portal bootstrap](../../plans/0001-portal-bootstrap.md))

## Context

The portal was originally scoped as mainly a Power BI report repository for internal staff,
so login was tied to **Entra ID (MSAL)** assuming every user holds an `@ezimetales.com`
M365 account. Two things changed the short-term direction:

1. **Power BI is out of v1.** It returns later as a dedicated Embedded module, not as the
   centerpiece of the first release.
2. **The portal must serve users without an EZI M365 account** (clients, plant/operations
   users) inside a controlled space, while keeping the door open to escalate to Power BI
   Embedded on capacity later.

Entra/MSAL cannot grant a controlled portal identity to users who have no M365 account, so
the original rationale ("everyone already has M365") no longer holds. Two identity concerns
remain distinct and must not be conflated:

- **Portal session (login):** "who are you and may you enter?"
- **Embed token (future Power BI render):** the technical permission for the iframe to
  render a specific report.

## Decision

- **Portal login = portal-owned credentials (username + password).** Implemented with
  **Auth.js / NextAuth v5** (Credentials provider, **JWT sessions**). The portal becomes the
  identity provider.
- **Users are admin-provisioned (invitation only)** — no self-registration — and the model
  is **multi-dimensional**: a user holds many **roles**, many **plants** (or `all_plants`),
  and many **departments**, all managed from the admin panel. RBAC and data scoping derive
  from these.
- **The design stays open to a future Entra SSO provider** for internal staff: it can be
  added as an additional Auth.js provider without rewriting the credential path.
- **Power BI is deferred from v1.** When reintroduced it will use **Embedded
  (app-owns-data) on a reserved capacity**: the embed token is issued by a **service
  principal** (`tokenType: Embed`), and **RLS is driven by the portal's own identity**
  passed via `effectiveIdentity` / `CUSTOMDATA` (roles/plants/departments) — *not* the
  user's Entra UPN. The service principal's secret lives in Azure Key Vault.

## Consequences

- The portal owns password storage (argon2id/bcrypt hashing), session issuance, route
  guards and API authorization — responsibilities previously delegated to M365. This is the
  accepted cost of admitting non-M365 users; it also fixes the prior gap where API routes
  had no auth checks at all.
- **JWT sessions** (forced by the Auth.js Credentials provider) mean no server-side session
  store; revocation relies on short token lifetimes plus a `token_version` / `is_active`
  check on each request.
- The user's role/plant/department scope is the same shape Power BI RLS will later consume,
  so introducing Embedded does not require reworking the identity model.
- Adding Entra SSO later is additive (a second provider), not a migration.
- Trade-off accepted: we reimplement parts of what M365 provides (MFA, offboarding) — these
  are out of scope for v1 and can be layered later (e.g. via the future Entra provider for
  internal users, or app-level MFA for external ones).
