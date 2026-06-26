import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import {
  findAuthUserByUsername,
  findAuthUserById,
  getUserRolesById,
} from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";

/**
 * Full Auth.js v5 config (Node runtime). Extends the edge-safe `authConfig`
 * with the Credentials provider and the DB-touching callbacks.
 *
 * - Login identifier: `username` (NOT email).
 * - Session strategy: `jwt` (mandatory with the Credentials provider).
 * - `token_version` is stored in the JWT and re-checked server-side on each
 *   request to support revocation (deactivation / version bump).
 */

interface AugmentedUser {
  id: string;
  userId: number;
  username: string;
  display_name: string | null;
  roles: string[];
  token_version: number;
}

function isAugmentedUser(value: unknown): value is AugmentedUser {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AugmentedUser).userId === "number"
  );
}

async function loadRoles(userId: number): Promise<string[]> {
  try {
    return await getUserRolesById(userId);
  } catch (err) {
    console.error("Failed to load roles for user", userId, err);
    return [];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(raw) {
        const username =
          typeof raw?.username === "string"
            ? raw.username.trim().toLowerCase()
            : "";
        const password =
          typeof raw?.password === "string" ? raw.password : "";
        if (!username || !password) return null;

        const user = await findAuthUserByUsername(username).catch((err) => {
          console.error("authorize: user lookup failed", err);
          return undefined;
        });
        if (!user) return null;
        if (!user.is_active) return null;
        if (!user.password_hash) return null;

        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) return null;

        const roles = await loadRoles(user.user_id);
        return {
          id: String(user.user_id),
          userId: user.user_id,
          username: user.username,
          display_name: user.display_name,
          roles,
          token_version: user.token_version,
        } satisfies AugmentedUser;
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      // Initial sign-in: `user` is the value returned from authorize().
      if (user && isAugmentedUser(user)) {
        token.userId = user.userId;
        token.username = user.username;
        token.name = user.display_name;
        token.roles = user.roles;
        token.tokenVersion = user.token_version;
        token.revoked = false;
        return token;
      }

      // Subsequent requests: verify session against the DB if we know the
      // user. token_version bump / deactivation invalidates the JWT here.
      if (token.userId != null && !token.revoked) {
        const current = await findAuthUserById(token.userId).catch((err) => {
          console.error("jwt: user re-check failed", err);
          return undefined;
        });
        if (
          !current ||
          !current.is_active ||
          current.token_version !== token.tokenVersion
        ) {
          token.revoked = true;
          token.userId = undefined;
          token.username = undefined;
          token.name = undefined;
          token.roles = undefined;
          token.tokenVersion = undefined;
        } else {
          // Roles can change during a session; refresh them each request.
          token.roles = await loadRoles(current.user_id);
        }
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token.userId != null && !token.revoked) {
        const u = {
          userId: token.userId,
          name: token.name ?? null,
          username: token.username ?? "",
          roles: token.roles ?? [],
        };
        session.user = u as unknown as typeof session.user;
      }
      return session;
    },
  },
});