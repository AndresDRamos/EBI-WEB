import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

/**
 * Edge middleware. Uses an edge-safe NextAuth instance (built from
 * `authConfig` only — no DB/argon2 imports) to decode the JWT session and
 * gate protected routes.
 *
 * - Every UI/API route requires a session except the public ones
 *   (`PUBLIC_PATHS`) and the Auth.js handlers under `/api/auth/*`. There is
 *   no per-prefix allowlist: authentication is default-deny (the matcher
 *   already excludes static assets), so new modules are protected without
 *   editing this file. Per-*page* authorization lives in each module's segment
 *   layout (`requireSectionOrRedirect`, ADR 0008), not here — but that guard
 *   needs the current pathname, which Next.js doesn't hand server layouts, so
 *   this middleware injects it as the `x-pathname` request header.
 * - Unauthenticated UI requests redirect to `/login`; API requests get `401`.
 * - Authenticated users hitting a public UI route are bounced to `/` (home).
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/invite", "/api/invite"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isApi = pathname.startsWith("/api");
  const isAuthEndpoint = pathname.startsWith("/api/auth/");
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Auth.js endpoints manage their own auth.
  if (isAuthEndpoint) return;

  // Public routes: bounce already-authenticated users off the login/invite UI
  // to the home landing; otherwise let the request through.
  if (isPublic) {
    if (isLoggedIn && !isApi) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return;
  }

  // Everything else requires a session.
  if (!isLoggedIn) {
    if (isApi) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated pass-through: expose the pathname to server layouts so the
  // page-level guard (`requireSectionOrRedirect`, ADR 0008) can resolve it.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)).*)",
  ],
};