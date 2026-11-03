/* Service worker for browser push notifications. Shows only what the server sent and only
 * opens links on this site. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "New notification" };
  }
  const title = typeof data.title === "string" ? data.title.slice(0, 120) : "New notification";
  const link = typeof data.link === "string" && data.link.startsWith("/") && !data.link.startsWith("//") ? data.link : "/app/notifications";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body.slice(0, 160) : undefined,
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link ?? "/app/notifications", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          c.navigate(url.href);
          return c.focus();
        }
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
