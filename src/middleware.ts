import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

/**
 * Edge middleware. Uses an edge-safe NextAuth instance (built from
 * `authConfig` only — no DB/argon2 imports) to decode the JWT session and
 * gate protected routes.
 *
 * - `(portal)` routes are surfaced at `/dashboards` and `/admin`.
 * - `/api/**` is authenticated except the Auth.js handlers under `/api/auth/*`.
 * - Unauthenticated UI requests redirect to `/login`; API requests get `401`.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/invite"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isApi = pathname.startsWith("/api");
  const isAuthEndpoint = pathname.startsWith("/api/auth/");
  const isAuthRoute = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isPortal =
    pathname.startsWith("/dashboards") || pathname.startsWith("/admin");

  if (isAuthEndpoint) return;

  if (isAuthRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/dashboards", req.url));
    }
    return;
  }

  if ((isPortal || isApi) && !isLoggedIn) {
    if (isApi) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)).*)",
  ],
};