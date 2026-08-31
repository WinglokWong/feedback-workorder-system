const STATIC_CACHE = "workorder-static-v1";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("workorder-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.svg" || url.pathname === "/manifest.webmanifest";
  if (!isStatic) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
