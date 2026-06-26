import "server-only";
import { hash, verify, Algorithm } from "@node-rs/argon2";

/**
 * Password hashing for portal-owned credentials.
 *
 * Uses argon2id (recommended for password storage). MUST run in the Node
 * runtime only — never in the edge middleware — because argon2 is native.
 * Imported by `src/auth.ts` (authorize) and the admin/invitation flows.
 */

const algorithm: Algorithm = 2; // Argon2id = 2

const HASH_PARAMS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm, ...HASH_PARAMS });
}

export async function verifyPassword(
  password: string,
  hashStr: string,
): Promise<boolean> {
  if (!hashStr) return false;
  try {
    return await verify(hashStr, password);
  } catch {
    return false;
  }
}