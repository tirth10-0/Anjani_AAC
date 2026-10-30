// Anjani Agri Care ERP - Production Service Worker
// Cache Name with Versioning
const CACHE_NAME = 'anjani-agri-care-erp-v3.2.0-pwa-fix';

const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './favicon.ico',
  './favicon.png',
  './apple-touch-icon.png',
  './assets/images/logo.jpg',
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

// Install: Cache essential app icons, pages & manifest, skip waiting to activate immediately
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
// 2. Manifest & Icons: Cache-first / Network-first fallback to ensure instantaneous 200 OK for WebAPK minter.
// 3. Navigation & other assets: Network-first with guaranteed 200 OK fallback response.
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

  // For icons and manifest: Cache-first with network background revalidation
  if (url.pathname.includes('/assets/icons/') || url.pathname.endsWith('manifest.json') || url.pathname.endsWith('favicon.ico') || url.pathname.endsWith('favicon.png')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      }).catch(() => fetch(request))
    );
    return;
  }

  // All other ERP navigation / assets: Network-first with guaranteed Response
  event.respondWith(
    fetch(request)
      .then((response) => {
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Navigation fallback (ensures WebAPK offline verification never receives undefined)
        if (request.mode === 'navigate') {
          const fallback = (await caches.match('./index.html')) || (await caches.match('./login.html'));
          if (fallback) return fallback;
        }
        return new Response('Network offline. Please reconnect to access live ERP data.', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
