"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

/**
 * The redesigned service worker (see public/sw.js) no longer caches
 * anything personalized at all — only /m/offline, the manifest, icons,
 * and generic static chunks. So there's nothing user-specific actually
 * sitting in the cache to leak between accounts on a shared device. This
 * still explicitly clears every cache on sign-out anyway, as real
 * defense-in-depth: correct today by construction, and still correct
 * if a future change to the cache list ever adds something that
 * shouldn't survive a sign-out.
 */
export function SignOutButton() {
  const [clearing, setClearing] = useState(false);

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setClearing(true);
    if ("caches" in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // Clearing is a best-effort defense-in-depth step, not the
        // actual sign-out — never block signing out just because cache
        // clearing failed for some reason.
      }
    }
    (e.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
  }

  return (
    <button
      type="submit"
      onClick={handleClick}
      disabled={clearing}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger-light px-4 py-3 text-sm font-medium text-danger active:bg-danger-light/70 disabled:opacity-70"
    >
      <LogOut className="h-4 w-4" />
      {clearing ? "Signing out…" : "Sign out"}
    </button>
  );
}
