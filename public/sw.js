/* DentIQ Service Worker — enables PWA install prompt */
const CACHE_NAME = 'dentiq-v1';
const STATIC_ASSETS = [
  '/',
  '/static/js/',
  '/static/css/',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Network-first strategy — always fetch fresh data, fall back to cache */
self.addEventListener('fetch', (event) => {
  // Only cache GET requests for static assets
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Don't intercept Supabase API calls — always need live data
  if (url.hostname.includes('supabase.co')) return;
  
  // For the app shell — network first, cache as fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
