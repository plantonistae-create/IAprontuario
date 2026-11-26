/* V5.24 — storage policy on the REAL page (fixtures stand in for Supabase/AI only; EMULATED Chromium/WebKit, not iOS/Android device evidence):
 *  1 space preflight blocks the recording BEFORE the microphone opens when the browser reports too little free space (and nothing is created, nothing is deleted)
 *  2 near-full storage warns but still records
 *  3 APP_CONFIG.audioBitsPerSecond reaches MediaRecorder (and is absent by default)
 *  4 retention enabled WITHOUT a confirmed remote backup never purges anything, even for sessions verified long ago in the local queue
 *  5 retention with the real vault + real queue records: purges exactly the verified+aged+finalized+reconfirmed session and keeps every other one
 * Usage: node tests/nexa-audio-retention.e2e.cjs [chromium|webkit|both] */
const {chromium,webkit}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const tenSrc=fs.readFileSync(path.join(__dirname,'nexa-ten-visits.main.e2e.cjs'),'utf8');const syntheticMic=eval('('+tenSrc.match(/const syntheticMic=(\(\)=>\{[\s\S]*?\n)/)[1].replace(/;\s*$/,'')+')');
const which=process.argv[2]||'both',sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MB=1048576,DAY=86400000,UID='aaaaaaaa-0000-4000-8000-0000000000a1';
let VARIANT={};   // replacements applied to index.html by the test server
async function open(browser,kind,port,init){
  const ctx=await browser.newContext(kind==='webkit'?{viewport:{width:1280,height:900}}:{viewport:{width:1440,height:1000},permissions:['microphone']});const p=await ctx.newPage();p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());
  if(kind==='webkit')await p.addInitScript(syntheticMic);if(init)await p.addInitScript(init);
  (async()=>{while(!p.isClosed()){await p.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
  await p.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaAudioStorageV524&&document.getElementById('nfStart'));
  if(await p.locator('#nexaNewCaseBtn').isVisible())await p.locator('#nexaNewCaseBtn').click();await p.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
  await p.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});return{ctx,p}}
const seen=()=>{const o=new MutationObserver(ms=>{for(const m of ms)for(const n of [...m.addedNodes])(window.__msgs=window.__msgs||[]).push(String(n.textContent||'').slice(0,300))});document.addEventListener('DOMContentLoaded',()=>o.observe(document.body,{childList:true,subtree:true}))};
const quota=(q,u)=>`Object.defineProperty(navigator,'storage',{value:{estimate:async()=>({quota:${q},usage:${u}}),persisted:async()=>false,persist:async()=>false},configurable:true});window.__gum=0;const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=function(){window.__gum++;return g.apply(this,arguments)};(${seen.toString()})()`;
async function run(kind,port){
  const browser=await (kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true}:{headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const L=s=>kind+' '+s;
  try{
    // 1 block
    VARIANT={};{const {ctx,p}=await open(browser,kind,port,quota(50*MB,49*MB));await p.locator('#nfStart').click();await sleep(2500);
      const s=await p.evaluate(()=>({gum:window.__gum,msgs:window.__msgs||[],rec:document.getElementById('recBtn').dataset.recordingState,sessions:null}));
      assert.equal(s.gum,0,L('microphone never opened'));assert.ok(s.msgs.some(m=>/Espaço insuficiente/.test(m)&&/nenhum áudio protegido foi apagado/.test(m)),L('clear message: '+JSON.stringify(s.msgs.slice(-3))));assert.notEqual(s.rec,'recording');
      assert.equal((await p.evaluate(()=>window.nexaAudioCheckpointP0.listOwned('aaaaaaaa-0000-4000-8000-0000000000a1'))).length,0,L('no vault session created'));await ctx.close();console.log('PASS',L('1 preflight blocks before the microphone, creates and deletes nothing'))}
    // 2 warn + 3 default bitrate absent
    {const {ctx,p}=await open(browser,kind,port,quota(1000*MB,850*MB)+';window.__mro=[];const MR=window.MediaRecorder;window.MediaRecorder=function(s,o){window.__mro.push(JSON.stringify(o||{}));return new MR(s,o)};window.MediaRecorder.prototype=MR.prototype;window.MediaRecorder.isTypeSupported=MR.isTypeSupported.bind(MR)');
      await p.locator('#nfStart').click();await p.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));const m=await p.evaluate(()=>({msgs:window.__msgs||[],mro:window.__mro}));
      assert.ok(m.msgs.some(x=>/85%/.test(x)),L('near-full warns: '+JSON.stringify(m.msgs.slice(-3))));assert.ok(m.mro.every(o=>!/audioBitsPerSecond/.test(o)),L('default: no bitrate option ('+m.mro+')'));await ctx.close();console.log('PASS',L('2 near-full storage warns but still records; 3 default leaves the encoder unchanged'))}
    // 3 configured bitrate
    VARIANT={bps:64000};{const {ctx,p}=await open(browser,kind,port,';window.__mro=[];const MR=window.MediaRecorder;window.MediaRecorder=function(s,o){window.__mro.push(JSON.stringify(o||{}));return new MR(s,o)};window.MediaRecorder.prototype=MR.prototype;window.MediaRecorder.isTypeSupported=MR.isTypeSupported.bind(MR)');
      await p.locator('#nfStart').click();await p.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));assert.ok((await p.evaluate(()=>window.__mro)).some(o=>/"audioBitsPerSecond":64000/.test(o)),L('configured bitrate reaches MediaRecorder'));await ctx.close();console.log('PASS',L('3 APP_CONFIG.audioBitsPerSecond reaches the encoder'))}
    // 4 + 5 retention
    VARIANT={retention:true};
    const seed=`(async()=>{const V=window.nexaAudioCheckpointP0,o='${UID}';const mk=(n,s)=>new Blob([new Uint8Array(n).fill(s)]);const E=n=>'30000000-0000-4000-8000-'+String(n).padStart(12,'0'),S=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
      for(let n=1;n<=4;n++){await V.begin({ownerId:o,encounterId:E(n),sessionId:S(n),mime:'audio/webm'});await V.append({ownerId:o,encounterId:E(n),sessionId:S(n),sequence:0,blob:mk(200,n)});if(n!==4)await V.finalize({ownerId:o,encounterId:E(n),sessionId:S(n),expectedChunkCount:1})}
      const db=await new Promise(r=>{const q=indexedDB.open('nexa-audio-backup-queue-v514',1);q.onupgradeneeded=()=>{q.result.createObjectStore('jobs',{keyPath:'sessionId'}).createIndex('by_owner','ownerId')};q.onsuccess=()=>r(q.result)});
      const put=j=>new Promise(r=>{const t=db.transaction('jobs','readwrite');t.objectStore('jobs').put(j);t.oncomplete=r});const now=Date.now(),D=${DAY};
      await put({sessionId:S(1),encounterId:E(1),ownerId:o,sourceVersion:1,state:'verified',verifiedAt:now-9*D,digest:'a'.repeat(64),attempts:1});   // verified 9 days ago
      await put({sessionId:S(2),encounterId:E(2),ownerId:o,sourceVersion:1,state:'verified',verifiedAt:now-2*D,digest:'b'.repeat(64),attempts:1});   // too recent
      await put({sessionId:S(3),encounterId:E(3),ownerId:o,sourceVersion:1,state:'retry',attempts:3});                                            // never verified
      return true})()`;
    {const {ctx,p}=await open(browser,kind,port);await p.evaluate(seed);
      // 4: real tick with retention ON but no remote adapter started => nothing may be purged
      await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaAudioStorageV524);await sleep(3000);
      const left=await p.evaluate(()=>window.nexaAudioCheckpointP0.listOwned('aaaaaaaa-0000-4000-8000-0000000000a1').then(l=>l.length));assert.equal(left,4,L('retention ON without a confirmed remote backup purged nothing'));console.log('PASS',L('4 retention enabled but remote unavailable: all 4 sessions survive the tick'));
      // 5: real vault + real queue records with a confirming remote
      const out=await p.evaluate(async()=>{const o='aaaaaaaa-0000-4000-8000-0000000000a1',seen=[];const r=await window.nexaAudioStorageV524.sweep({vault:window.nexaAudioCheckpointP0,queue:window.nexaAudioBackupQueueV514,ownerId:o,policy:{enabled:true,days:7},confirmRemote:async(sc,d)=>{seen.push([sc.sessionId.slice(-2),d.slice(0,1)]);return true},activeEncounterId:null});
        return{purged:r.purged.map(x=>x.sessionId.slice(-2)),kept:Object.fromEntries(r.kept.map(k=>[k.sessionId.slice(-2),k.reason])),seen,remaining:(await window.nexaAudioCheckpointP0.listOwned(o)).map(x=>x.sessionId.slice(-2)).sort()}});
      assert.deepEqual(out.purged,['01']);assert.deepEqual(out.seen,[['01','a']]);assert.equal(out.kept['02'],'WITHIN_RETENTION_WINDOW');assert.equal(out.kept['03'],'NO_VERIFIED_REMOTE_BACKUP');assert.equal(out.kept['04'],'NOT_FINALIZED');assert.deepEqual(out.remaining,['02','03','04']);
      const rec=await p.evaluate(async()=>{const o='aaaaaaaa-0000-4000-8000-0000000000a1';try{await window.nexaAudioCheckpointP0.recover({ownerId:o,encounterId:'30000000-0000-4000-8000-000000000002',sessionId:'40000000-0000-4000-8000-000000000002'});return'ok'}catch(e){return e.message}});assert.equal(rec,'ok','the kept sessions are still recoverable');
      await ctx.close();console.log('PASS',L('5 retention with real vault/queue purges only the verified+aged+finalized+reconfirmed session'))}
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html'){body=body.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
        if(VARIANT.bps)body=body.replace('audioBitsPerSecond:null','audioBitsPerSecond:'+VARIANT.bps);if(VARIANT.retention)body=body.replace('audioRetention:{enabled:false,days:7}','audioRetention:{enabled:true,days:7}')}
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',port);if(which!=='chromium')await run('webkit',port);console.log('AUDIO_RETENTION_E2E_PASS (emulated; not iOS/Android device evidence)')}catch(e){console.error('AUDIO_RETENTION_E2E_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}
})();
