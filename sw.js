const CACHE='sbu-v5-fix-cors';const ASSETS=['./','./index.html','./app.js','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))).then(()=>self.clients.claim());});
self.addEventListener('fetch',e=>{
  const url=e.request.url;
  // JANGAN intercept CDN - biar tidak CORS error
  if(url.includes('cdn.tailwindcss.com')||url.includes('cdnjs.cloudflare.com')||url.includes('cdn.jsdelivr.net')||url.includes('fonts.googleapis.com')||url.includes('fonts.gstatic.com')||url.includes('script.google.com')){
    return; // biar browser handle langsung, tidak lewat SW
  }
  // Hanya cache file same-origin
  if(url.startsWith(self.location.origin)){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      // cache clone
      const clone=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request, clone));
      return res;
    }).catch(()=>caches.match('./index.html'))));
  }
});
