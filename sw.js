// Service worker بسيط: بيكاش الـ app shell عشان التطبيق يفتح حتى من غير نت
// (البيانات نفسها - الحجوزات والدردشة - محتاجة نت عشان تتحدث زي ما اتطلب)
const CACHE_NAME = "soffara-shell-v3";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css?v=6",
  "./app.js?v=6",
  "./i18n.js?v=6",
  "./config.js?v=6",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // App shell فقط: fallback للكاش لو مفيش نت. باقي الطلبات (Supabase) بتعدي عادي.
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
