# ADR 0001 — Entra ID for portal login; Power BI embed via service principal in production

- **Status:** Accepted — 2026-06-24
- **Context plan:** [0001 — Portal bootstrap](../../plans/0001-portal-bootstrap.md)

## Context

The portal is internal; all users already have Microsoft 365 accounts. Two distinct
identity concerns are easy to conflate:

- **Portal session token (login):** "who are you and may you enter?"
- **Embed token (Power BI render):** the technical permission for the iframe to render a
  specific report.

In development (PPU, org-embed / user owns data) a single Entra user token covers both. In
production with a reserved Fabric capacity (app-owns-data) the embed token is issued by a
service principal, so the user's Entra token is no longer needed to render — but
authentication and authorization of who enters the portal still are.

## Decision

- **Portal login = Entra ID (MSAL) in both phases.** Reuses M365 SSO, MFA/conditional
  access, automatic offboarding, and Entra groups for RBAC. The user's UPN maps cleanly to
  Power BI **RLS**.
- **Embed token:**
  - Dev (PPU): the user's AAD token renders directly (`tokenType: Aad`).
  - Prod (capacity): the backend's **service principal** issues an embed token
    (`tokenType: Embed`), passing the user's UPN as `effectiveIdentity` for RLS. The
    service principal's client secret lives in Azure Key Vault.
- **MSAL does not disappear in production**; it stops issuing the embed token only.

## Consequences

- Only `getEmbedToken()` in `src/lib/powerbi/` forks by mode; the embed component does not.
  Dev → prod is configuration, not a rewrite.
- A custom portal login was rejected: it would mean managing passwords, MFA, offboarding and
  manual RLS mapping — reimplementing what M365 already provides, with more attack surface.
- A custom/hybrid login would only be justified to grant access to external users without
  M365 accounts; not the current case.
