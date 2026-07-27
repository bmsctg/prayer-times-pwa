// Service Worker for Prayer Times PWA
const CACHE_NAME = 'prayer-times-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './ifis-data.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './adhan.wav'
];

// Install Event - Pre-cache essential offline assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches and claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate / Network-first with cache fallback
self.addEventListener('fetch', event => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Update cache if valid response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Push Event - Triggered by Cloudflare Worker when prayer time arrives
self.addEventListener('push', event => {
  let data = {
    title: 'Prayer Time',
    body: "It's time for prayer",
    tag: 'prayer',
    icon: './icon-192.png'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || "It's time for prayer",
    icon: data.icon || './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'prayer',
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: './'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Prayer Time', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});
