// Service worker: enough for Chrome's install criteria, no caching, plus Web
// Push display. Every request still goes straight to the network, so there
// is nothing stale to debug when the app updates.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pass-through: the browser performs the request normally.
});

// Show a push unless the member is already looking at the page it points
// at (the room they are reading should not buzz them).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "SECBL", body: event.data ? event.data.text() : "" };
  }
  const url = data.url || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins.some((w) => w.visibilityState === "visible" && new URL(w.url).pathname === url);
      if (open) return;
      await self.registration.showNotification(data.title || "SECBL", {
        body: data.body || "",
        tag: data.tag,
        renotify: !!data.tag,
        data: { url },
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
