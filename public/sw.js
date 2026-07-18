// FFC Field service worker.
//
// Deliberately NOT caching Supabase data or RPC responses — a stale
// shipment status shown as if it were current could send someone to the
// wrong gate or tell a customs officer the wrong thing. Everything data-
// related is always network-first with no cache fallback; only the
// app shell (so the PWA opens instantly and shows a real offline screen
// instead of a browser error) and static assets are cached.

const CACHE_NAME = "ffc-field-shell-v1";
const APP_SHELL = ["/m", "/m/offline", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch Supabase requests (auth, RPC, storage) — always live,
  // never cached, never intercepted with a fallback. A failed request
  // here should surface as a real error the app can show, not a silent
  // stale response.
  if (url.hostname.includes("supabase.co")) return;

  // Navigations: network-first, falling back to the cached offline page
  // only when there's truly no connection.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/m/offline").then((res) => res || caches.match("/m")))
    );
    return;
  }

  // Static assets (icons, fonts, JS/CSS chunks): cache-first, since these
  // are genuinely immutable per build and safe to serve instantly.
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
