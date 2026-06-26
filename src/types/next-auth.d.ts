import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      userId: number;
      username: string;
      roles: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: number;
    username?: string;
    name?: string | null;
    roles?: string[];
    tokenVersion?: number;
    revoked?: boolean;
  }
}