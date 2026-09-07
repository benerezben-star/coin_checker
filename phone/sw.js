// Caches the whole app so it runs with no connection at all.
// Bump CACHE_VERSION whenever app files change, to force a refresh.
const CACHE_VERSION = "coin-checker-v4";

const ASSETS = [
  "./", "./index.html", "./app.css", "./manifest.json",
  "./js/main.js", "./js/db.js", "./js/specs.js", "./js/varieties.js", "./js/imaging.js",
  "./data/us_specs.json", "./data/varieties.json", "./data/error_types.json",
  "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: the app must work with no network, and none of these assets
// change unless the app itself is redeployed.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
