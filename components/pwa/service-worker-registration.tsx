"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Explicit scope matters here: without it, a service worker
      // registered from a root-level script defaults to site-wide scope
      // ("/"), meaning it would intercept every fetch on the desktop app
      // too, not just /m — even though sw.js's own fetch handler mostly
      // lets non-matching requests pass through. Scoping narrows what the
      // browser hands the worker at all, which is the more correct fix
      // than relying on the handler's own filtering alone.
      navigator.serviceWorker.register("/sw.js", { scope: "/m/" }).catch(() => {
        // A failed registration shouldn't break the app itself — the PWA
        // simply won't be installable/offline-capable this session,
        // everything else keeps working normally.
      });
    }
  }, []);

  return null;
}
