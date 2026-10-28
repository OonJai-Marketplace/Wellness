const CACHE='oonjai-wellness-v11';
const FILES=['./','./index.html','./style.css?v=1.2.0','./app.js?v=1.2.0','./core.js?v=1.2.0','./tickets.js?v=1.2.0','./navigation.js?v=1.2.0','./vault.js?v=1.2.0','./config.js?v=1.2.0','./vendor/supabase.js','./updates.js?v=1.2.0','./manifest.webmanifest','./assets/logo.png','./assets/oonjai-favicon.png?v=oonjai-1','./assets/oonjai-192.png?v=oonjai-1','./assets/oonjai-512.png?v=oonjai-1','./assets/oonjai-maskable.png?v=oonjai-1'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('oonjai-wellness-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.endsWith('/version.json'))return;
 // Only public app-shell files are cached. Auth/API traffic and health data never enter the service-worker cache.
 const known=FILES.some(f=>new URL(f,self.location.href).pathname===url.pathname);if(!known)return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});

self.addEventListener('push',event=>{let payload={};try{payload=event.data?.json()||{};}catch{}event.waitUntil(self.registration.showNotification(payload.title||'Wellness administrator alert',{body:payload.body||'Open Wellness to review administrator alerts.',icon:'./assets/oonjai-192.png',badge:'./assets/oonjai-192.png',tag:payload.tag||'wellness-review',data:{url:payload.url==='./#settings'?'./#settings':'./#home'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=new URL(event.notification.data?.url||'./#home',self.registration.scope).href;event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const client=clients.find(c=>c.url.startsWith(self.registration.scope));if(client){await client.navigate(url);return client.focus();}return self.clients.openWindow(url);}));});
