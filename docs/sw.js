const CACHE="sorteo-oviedo-v4";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg","./portada-premio.jpg?v=4"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const req=e.request;
 const isNav=req.mode==="navigate";
 e.respondWith(
   fetch(req,{cache:"no-store"}).then(r=>{
     const copy=r.clone();
     caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
     return r;
   }).catch(()=>caches.match(req).then(r=>r||(isNav?caches.match("./index.html"):undefined)))
 );
});