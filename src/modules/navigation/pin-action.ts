"use server";

import { cookies } from "next/headers";
import { SIDEBAR_PIN_COOKIE } from "./pin-cookie";

/**
 * Persists the sidebar pin state per browser (not per user — a shared
 * workstation can have its own preference). Read back in `(portal)/layout.tsx`
 * so the shell renders pinned/collapsed with no flash on first paint.
 */
export async function setSidebarPinned(pinned: boolean): Promise<void> {
  const store = await cookies();
  store.set(SIDEBAR_PIN_COOKIE, pinned ? "1" : "0", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
