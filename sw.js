const CACHE_NAME = "nexa-v3.4.2";
const APP_SHELL = ["./","./index.html","./manifest.webmanifest","./apple-touch-icon.png","./icon-192.png","./icon-512.png","./favicon-64.png"];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    for (const u of APP_SHELL) { try { await cache.add(new Request(u,{cache:"reload"})); } catch (_) {} }
  }));
});
self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const r=event.request;if(r.method!=="GET")return;
  const u=new URL(r.url);if(u.origin!==self.location.origin)return;
  if(r.mode==="navigate"||u.pathname.endsWith("/index.html")){
    event.respondWith(fetch(new Request(r,{cache:"no-store"})).then(async res=>{
      if(res?.ok){const c=await caches.open(CACHE_NAME);await c.put("./index.html",res.clone())}
      return res;
    }).catch(()=>caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(r).then(cached=>{
    const net=fetch(r).then(async res=>{if(res?.ok){const c=await caches.open(CACHE_NAME);await c.put(r,res.clone())}return res}).catch(()=>cached);
    return cached||net;
  }));
});
