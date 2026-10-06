// Minimal service worker: enough for Chrome's install criteria, no caching.
// Every request still goes straight to the network, so there is nothing
// stale to debug when the app updates.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pass-through: the browser performs the request normally.
});
