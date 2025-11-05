const CACHE = 'unemi-campus-v1';
const APP_SHELL = [
  '/', '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/src/main.tsx',
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

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

  e.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const cached = await caches.match(req);
      return cached || new Response('', { status: 504 });
    }
  })());
});

// =================================================================
// --- 🔔 NUEVO: LISTENER PARA RECIBIR NOTIFICACIONES PUSH ---
// =================================================================
// Esto se dispara cuando una notificación push llega del servidor
self.addEventListener('push', (e) => {
  // El servidor envía los datos como un JSON
  const data = e.data.json();

  const title = data.title || 'UNEMI Campus';
  const options = {
    body: data.body, // El texto del mensaje
    icon: data.icon || '/icons/icon-192.png', // Ícono de la notificación
    badge: '/icons/badge-72.png', // Ícono pequeño (para Android)
    data: {
      url: data.url || '/', // A dónde ir al hacer clic
    },
    sound: '/notification.mp3',
    vibrate : [200, 100, 200]
  };

  // Muestra la notificación
  e.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// =================================================================
// --- 🖱️ NUEVO: LISTENER PARA CLICS EN LA NOTIFICACIÓN ---
// =================================================================
// Esto se dispara cuando el usuario HACE CLIC en la notificación
self.addEventListener('notificationclick', (e) => {
  // Cierra la notificación
  e.notification.close();

  // URL a la que debemos navegar
  const urlToOpen = e.notification.data.url;

  // Revisa si la app ya está abierta en una pestaña
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si hay una pestaña abierta, la enfoca
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no hay pestañas abiertas (o no coincide), abre una nueva
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});