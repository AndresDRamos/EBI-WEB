import {
  type Configuration,
  type PopupRequest,
  type SilentRequest,
  BrowserCacheLocation,
  InteractionType,
} from "@azure/msal-browser";

/**
 * Entra ID (MSAL) configuration for the EBI portal login.
 *
 * All values come from environment variables (see `.env.example`). Only the
 * `NEXT_PUBLIC_*` values are needed by the browser bundle. The portal login is
 * Entra SSO; the Power BI embed token is acquired separately by
 * `src/lib/powerbi/` (see ADR 0001).
 */

const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ?? "";
const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ?? "common";
const redirectUri =
  process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI ?? "http://localhost:3001";
const postLogoutUri =
  process.env.NEXT_PUBLIC_AZURE_AD_POST_LOGOUT_URI ?? "http://localhost:3001";

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: postLogoutUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.SessionStorage,
    storeAuthStateInCookie: false,
  },
};

/** Minimal scopes requested at interactive login. */
export const loginRequest: PopupRequest = {
  scopes: ["openid", "profile", "User.Read"],
  prompt: "select_account",
};

/** Silent token request shape for the Power BI scope (org-embed, user owns data). */
export const powerbiScope =
  process.env.NEXT_PUBLIC_POWERBI_SCOPE ??
  "https://analysis.windows.net/powerbi/api/.default";

export const powerbiTokenRequest: SilentRequest = {
  scopes: [powerbiScope],
  forceRefresh: false,
};

/** Embed mode: `org-embed` (dev/PPU, Aad) vs `capacity` (prod app-owns-data). */
export const embedMode =
  (process.env.NEXT_PUBLIC_EMBED_MODE as "org-embed" | "capacity") ??
  "org-embed";

export const InteractionTypeRedirect = InteractionType.Redirect;