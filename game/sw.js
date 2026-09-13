/* Оффлайн-кэш «Точки реза»: своё — из кэша, шрифты — из сети с запасом в кэше. */
const CACHE = "tochka-reza-v1";
const CORE = [
  "./",
  "index.html",
  "game.css",
  "game.js",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const sameOrigin = new URL(req.url).origin === location.origin;

  if (sameOrigin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  // Шрифты: отдаём копию сразу, а свежую версию кладём в кэш на будущее.
  if (/fonts\.(googleapis|gstatic)\.com/.test(req.url)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
