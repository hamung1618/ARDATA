// =====================================================================
// Service Worker — Bank Data Penjualan & AR Minyak/Rupa (ARDATA)
// Tujuan: aplikasi tetap bisa DIBUKA walau tidak ada sinyal internet.
// Data (IndexedDB) TIDAK disentuh oleh file ini — itu sudah aman
// tersimpan di perangkat lewat kode hydrateStorage() yang sudah ada.
// =====================================================================

const CACHE_VERSION = 'v1';
const CACHE_NAME = 'ardata-shell-' + CACHE_VERSION;

// File inti yang WAJIB tersedia offline (app shell)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Domain CDN pihak ketiga yang boleh di-cache (font, library excel)
const RUNTIME_CACHE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

// Domain yang TIDAK boleh di-cache (data live, harus selalu network)
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'cloudflareinsights.com'
];

// ---------- INSTALL: simpan app shell ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            // Kalau salah satu file (mis. ikon) belum ada di repo, jangan gagalkan semua
            console.warn('[SW] gagal cache:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE: bersihkan cache versi lama ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('ardata-shell-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- FETCH: strategi berbeda per jenis request ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // biarkan POST/PUT (mis. ke Supabase) lewat apa adanya

  const url = new URL(req.url);

  // 1) Jangan pernah cache endpoint data live (Supabase, analytics)
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.includes(h))) {
    return; // biarkan browser handle langsung, tidak diintervensi SW
  }

  // 2) Halaman utama / navigasi: network dulu (biar dapat update terbaru),
  //    kalau offline baru pakai cache — inilah yang bikin app bisa dibuka tanpa internet.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // 3) Aset CDN (font, xlsx.js): cache-first, update di background
  if (RUNTIME_CACHE_HOSTS.some((h) => url.hostname.includes(h))) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4) File statis lain yang sama origin (ikon, manifest, dll): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        return (
          cached ||
          fetch(req)
            .then((res) => {
              const resClone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
              return res;
            })
            .catch(() => cached)
        );
      })
    );
  }
});
