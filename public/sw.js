// Anjani Agri Care ERP - Production Service Worker
// Cache Name with Versioning
const CACHE_NAME = 'anjani-agri-care-erp-v3.1.0-rounded-logo';

const STATIC_ASSETS = [
  './manifest.json',
  './assets/icons/icon-48x48.png',
  './assets/icons/icon-72x72.png',
  './assets/icons/icon-96x96.png',
  './assets/icons/icon-128x128.png',
  './assets/icons/icon-144x144.png',
  './assets/icons/icon-152x152.png',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-384x384.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/icon-maskable-192x192.png',
  './assets/icons/icon-maskable-512x512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32x32.png',
  './assets/icons/favicon-16x16.png'
];

// Install: Cache essential app icons & manifest, skip waiting to activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching warning (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Evict any old caches from previous versions and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Evicting outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy tailored to ERP safety
// 1. Supabase / Database / Auth / Mutations: Network-only, NEVER cached.
// 2. Manifest & Icons: Network-first (update cache on success, cache fallback if offline).
// 3. Other assets: Network-first to always ensure fresh ERP business logic.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Bypass non-GET requests immediately (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') {
    return;
  }

  // Bypass Supabase API, external CDNs, and auth endpoints entirely
  if (url.hostname.includes('supabase.co') || url.hostname.includes('googleapis.com')) {
    return;
  }

  // For icons and manifest: Network-first with cache fallback
  if (url.pathname.includes('/assets/icons/') || url.pathname.endsWith('manifest.json') || url.pathname.endsWith('favicon.ico')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // All other ERP navigation / assets: Network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
