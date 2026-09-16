// Service worker بسيط: بيكاش الـ app shell عشان التطبيق يفتح حتى من غير نت
// (البيانات نفسها - الحجوزات والدردشة - محتاجة نت عشان تتحدث زي ما اتطلب)
const CACHE_NAME = "soffara-shell-v7";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css?v=12",
  "./app.js?v=12",
  "./i18n.js?v=12",
  "./config.js?v=12",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./logo.png",
];

// ---------- Firebase Cloud Messaging: background notifications ----------
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
importScripts("./config.js?v=12");
try {
  firebase.initializeApp(self.SOFFARA_CONFIG.firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "صفارة";
    const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "";
    self.registration.showNotification(title, {
      body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: (payload.data && payload.data.tag) || "soffara-notif",
    });
  });
} catch (err) {
  console.warn("FCM background init failed", err);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});

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
