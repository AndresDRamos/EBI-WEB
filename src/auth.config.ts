import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe subset of the Auth.js config.
 *
 * Consumed by `src/middleware.ts` and re-exported from `src/auth.ts`. This file
 * MUST NOT import anything that relies on the Node runtime (no Kysely, no
 * argon2) so it can run in the edge middleware. The Credentials provider and
 * the DB-touching callbacks live in `src/auth.ts`.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  trustHost: true,
  callbacks: {
    // Edge-safe callbacks. The richer jwt callback that embeds userId/roles
    // and checks token_version lives in src/auth.ts (Node runtime); here we
    // only shape the session from the token so middleware can read it.
    jwt({ token, user }) {
      if (user) {
        // `user` carries our augmented fields (see src/auth.ts authorize()).
        const u = user as unknown as {
          userId: number;
          username: string;
          display_name: string | null;
          roles: string[];
          token_version: number;
        };
        if (typeof u.userId === "number") {
          token.userId = u.userId;
          token.username = u.username;
          token.name = u.display_name;
          token.roles = u.roles;
          token.tokenVersion = u.token_version;
          token.revoked = false;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId != null && !token.revoked) {
        const u = {
          userId: token.userId,
          name: token.name ?? null,
          username: token.username ?? "",
          roles: token.roles ?? [],
        };
        // Credentials + JWT: no adapter, so session.user carries only our
        // augmented fields. Default typing unions in AdapterUser fields; cast.
        session.user = u as unknown as typeof session.user;
      }
      return session;
    },
  },
};