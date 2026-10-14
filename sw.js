const CACHE_NAME = 'sbu-absen-v2.1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(()=>{})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for GAS API, Cache first for assets
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
  } else {
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, fetchRes.clone());
          return fetchRes;
        });
      }).catch(()=>caches.match('./index.html')))
    );
  }
});
