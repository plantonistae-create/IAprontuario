const CACHE_NAME="nexa-v3.7.1";
const APP_SHELL=["./","./index.html"];
self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL).catch(()=>{})));
});
self.addEventListener("activate",e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",e=>{
  const r=e.request;
  if(r.method!=="GET")return;
  const u=new URL(r.url);
  if(u.origin!==self.location.origin)return;
  if(r.mode==="navigate"||u.pathname.endsWith("/index.html")){
    e.respondWith(
      fetch(new Request(r,{cache:"no-store"}))
        .then(async res=>{
          if(res?.ok){
            const c=await caches.open(CACHE_NAME);
            await c.put("./index.html",res.clone());
          }
          return res;
        })
        .catch(()=>caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(caches.match(r).then(cached=>cached||fetch(r)));
});
