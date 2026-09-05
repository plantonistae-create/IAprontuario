const CACHE_NAME="nexa-v18-6-1-radar-restore-20260905";
const HOTFIX_URL="./nexa-hotfix.js?v=20260905-v1861";
const INDEX_URL="./index.html";

async function injectHotfix(response){
  if(!response)return response;
  const type=response.headers.get("content-type")||"";
  if(!type.includes("text/html"))return response;
  const text=await response.text();
  const tag=`<script src="${HOTFIX_URL}"></script>`;
  const pattern=/<script\s+src=["']\.\/nexa-hotfix\.js(?:\?[^"']*)?["']><\/script>/i;
  const html=pattern.test(text)
    ?text.replace(pattern,tag)
    :(text.includes("</body>")?text.replace("</body>",`${tag}</body>`):`${text}${tag}`);
  const headers=new Headers(response.headers);
  headers.set("content-type","text/html; charset=utf-8");
  headers.set("cache-control","no-store, max-age=0");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(Promise.resolve())});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);if(u.origin!==self.location.origin)return;
  if(r.mode==="navigate"||u.pathname.endsWith("/index.html")){
    e.respondWith((async()=>{
      try{return await injectHotfix(await fetch(new Request(r,{cache:"no-store"})))}
      catch{return (await caches.match(INDEX_URL))||Response.error()}
    })());
    return;
  }
  if(/\/nexa-[^/]+\.js$/.test(u.pathname)||u.pathname.endsWith("/nexa-hotfix.js")){
    e.respondWith(fetch(new Request(r,{cache:"no-store"})).catch(()=>caches.match(r)));
    return;
  }
  e.respondWith(fetch(r).catch(()=>caches.match(r)));
});
