const CACHE_NAME = "control-glucemia-shell-v4-notification-settings";
const APP_SHELL = [
  "./",
  "./index.html",
  "./notifications.js",
  "./notifications.css",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./favicon.ico",
  "./favicon-32x32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const staticNames = new Set([
    "index.html",
    "notifications.js",
    "notifications.css",
    "manifest.webmanifest",
    "icon-192.png",
    "icon-512.png",
    "apple-touch-icon.png",
    "icon-maskable-192.png",
    "icon-maskable-512.png",
    "favicon.ico",
    "favicon-32x32.png"
  ]);
  const fileName = url.pathname.split("/").pop();

  // Network-first for page navigation so app updates are seen quickly.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Cache only our static PWA files; API/Supabase traffic is untouched.
  if (staticNames.has(fileName)) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
      )
    );
  }
});


self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "Control de Glucemia";
  const options = {
    tag: data.tag || undefined,
    body: data.body || "Tienes una nueva notificación.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({type:"window",includeUncontrolled:true});
    for (const client of clientsList) {
      if ("focus" in client) {
        await client.navigate(target).catch(() => {});
        return client.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  })());
});
