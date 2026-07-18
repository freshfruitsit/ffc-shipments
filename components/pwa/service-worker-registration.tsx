"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration shouldn't break the app itself — the PWA
        // simply won't be installable/offline-capable this session,
        // everything else keeps working normally.
      });
    }
  }, []);

  return null;
}
