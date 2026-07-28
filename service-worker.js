/* ULC Portal service worker — offline app shell (browser + Capacitor https://localhost) */
const CACHE = "ulc-portal-v80";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.png",
  "./logo.js",
  "./js/config.js",
  "./js/award-math.js",
  "./js/ulc-cloud.js",
  "./js/teacher.js",
  "./js/student-dashboard.js",
  "./js/letter-app.js",
  "./js/letter-templates.json",
  "./js/my-files.js",
  "./js/native-save.js",
  "./js/capacitor-bridge.js",
  "./js/syllabus-catalog.js",
  "./js/syllabus-app.js",
  "./assets/campus-hero.jpg",
  "./assets/batch-2025-29-section-a.png",
  "./assets/developer-saif.png",
  "./icons/ulc-logo.png",
  "./icons/uob-logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

const SW_ORIGIN = self.location.origin;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        Promise.all(
          ASSETS.map((url) =>
            c.add(url).catch(() => {
              /* missing optional asset — skip */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  // Only handle same-origin (includes Capacitor https://localhost); leave Supabase/CDN alone.
  if (url.origin !== SW_ORIGIN) return;

  // Network-first for navigations, cache-first for the rest.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => hit)
    )
  );
});
