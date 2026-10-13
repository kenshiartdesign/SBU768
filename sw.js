const CACHE_NAME = 'sbu-v2.2-fixed';
const ASSETS = ['./','./index.html','./app.js','./manifest.json'];

self.addEventListener('install', e => {
  console.log('[SW] Install');
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(()=>{})));
});

self.addEventListener('activate', e => {
  console.log('[SW] Activate');
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('script.google.com') || e.request.url.includes('googleapis')) {
    return e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(()=>caches.match('./index.html'))));
});
