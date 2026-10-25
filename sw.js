const CACHE='oonjai-wellness-v7';
const FILES=['./','./index.html','./style.css?v=1.0.1','./app.js?v=1.0.1','./core.js?v=1.0.1','./vault.js?v=1.0.1','./config.js?v=1.0.1','./vendor/supabase.js','./updates.js?v=1.0.1','./manifest.webmanifest','./assets/logo.png','./assets/oonjai-favicon.png?v=oonjai-1','./assets/oonjai-192.png?v=oonjai-1','./assets/oonjai-512.png?v=oonjai-1','./assets/oonjai-maskable.png?v=oonjai-1'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('oonjai-wellness-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.endsWith('/version.json'))return;
 // Only public app-shell files are cached. Auth/API traffic and health data never enter the service-worker cache.
 const known=FILES.some(f=>new URL(f,self.location.href).pathname===url.pathname);if(!known)return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
