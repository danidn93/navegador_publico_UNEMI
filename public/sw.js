// public/sw.js
const CACHE = 'unemi-campus-v1';
const APP_SHELL = [
  '/', '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/src/main.tsx', // Vite reescribe rutas, no pasa nada si falla
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

// Estrategia: Network-first para HTML; Cache-first para estáticos.
// (No cacheamos agresivo los tiles de OSM para evitar sanciones.)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Evita interceptar no-GET
  if (req.method !== 'GET') return;

  // HTML → network-first
  if (req.headers.get('accept')?.includes('text/html')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('/index.html');
      }
    })());
    return;
  }

  // Estáticos → cache-first
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Externos (ej. OSM) → network-first con fallback
  e.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const cached = await caches.match(req);
      return cached || new Response('', { status: 504 });
    }
  })());
});
