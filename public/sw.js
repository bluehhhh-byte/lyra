// Offline support: pages you've visited keep working on the subway.
// - Pages/API-free routes: network-first, cache fallback → no stale HTML after
//   a deploy, and no cache-version bookkeeping.
// - Hashed assets (/_next/static) & album art (mzstatic): cache-first, the
//   URLs are content-addressed/immutable.
// - Never touches /admin, /api, or audio (previews stream with range requests).
const CACHE = "lyra-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.destination === "audio") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;

  const immutable =
    url.pathname.startsWith("/_next/static/") || url.hostname.endsWith("mzstatic.com");

  if (immutable) {
    e.respondWith(
      caches.open(CACHE).then(
        async (c) =>
          (await c.match(req)) ||
          fetch(req).then((res) => {
            // opaque (no-cors image) responses report status 0 but are cacheable
            if (res.status === 200 || res.type === "opaque") c.put(req, res.clone());
            return res;
          })
      )
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
