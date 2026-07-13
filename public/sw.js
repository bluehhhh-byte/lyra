// Kill switch — the offline feature was removed. Any service worker already
// registered on a visitor's browser picks this up on its next update check,
// drops every cache, and unregisters itself. Delete this file a while after
// no clients can still hold the old worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});
