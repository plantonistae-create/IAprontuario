/* V5.23 — resilience of the encrypted local audio vault (nexa-audio-checkpoint-p0.js), real IndexedDB + WebCrypto in Chromium and WebKit.
 * EMULATED ENVIRONMENT: this is NOT evidence for iOS Safari or Android Chrome on real devices (storage eviction, OS process kill, screen lock and
 * real quota behave differently there). The device protocol lives in labs/nexa-v523/DEVICE-HOMOLOGATION-PROTOCOL.md and nexa-v523-device-selftest.html.
 * Synthetic bytes only. No network, no Supabase, no AI. */
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const A='aaaaaaaa-0000-4000-8000-0000000000a1',B='bbbbbbbb-0000-4000-8000-0000000000b1';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const server=http.createServer((q,r)=>{
  if(q.url.startsWith('/blank')){r.writeHead(200,{'content-type':'text/html'});r.end('<!doctype html><title>vault</title><script src="/nexa-audio-checkpoint-p0.js"></script>');return}
  fs.readFile(path.join(root,decodeURIComponent(q.url.split('?')[0])),(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':'text/javascript'});r.end(d)});
});
const bytes=(n,seed)=>Array.from({length:n},(_,i)=>(i*31+seed)&255);
const results=[];const ok=(label)=>{results.push(label);console.log('PASS',label)};

async function suite(kind,port){
  const launcher=kind==='webkit'?webkit:chromium,browser=await launcher.launch({headless:true});
  const ctx=await browser.newContext();
  const open=async()=>{const p=await ctx.newPage();await p.goto('http://127.0.0.1:'+port+'/blank');await p.waitForFunction(()=>!!window.nexaAudioCheckpointP0);return p};
  const L=s=>kind+' '+s;
  try{
    // helper executed in page: makes a deterministic chunk blob
    const mk=`(n,seed)=>new Blob([new Uint8Array(Array.from({length:n},(_,i)=>(i*31+seed)&255))],{type:'audio/webm'})`;

    // 1. abrupt close with sequential acknowledged appends: recover returns a verified contiguous prefix >= acknowledged
    for(let round=0;round<6;round++){
      const p=await open(),enc=id(100+round),ses=id(200+round);
      await p.evaluate(async([A,enc,ses])=>{await window.nexaAudioCheckpointP0.begin({ownerId:A,encounterId:enc,sessionId:ses,mime:'audio/webm'})},[A,enc,ses]);
      // fire a serialized chain exactly like the recorder does, close the page at a random moment WITHOUT letting it finish
      await p.evaluate(([A,enc,ses])=>{window.__acked=0;const mk=(n,seed)=>new Blob([new Uint8Array(Array.from({length:n},(_,i)=>(i*31+seed)&255))],{type:'audio/webm'});
        let q=Promise.resolve();for(let s=0;s<40;s++)q=q.then(()=>window.nexaAudioCheckpointP0.append({ownerId:A,encounterId:enc,sessionId:ses,sequence:s,blob:mk(4000,s)})).then(()=>{window.__acked++}).catch(()=>{})},[A,enc,ses]);
      await p.waitForTimeout(40+round*35);
      const acked=await p.evaluate(()=>window.__acked).catch(()=>0);
      await p.close({runBeforeUnload:false});
      const p2=await open();
      const r=await p2.evaluate(async([A,enc,ses])=>{try{const x=await window.nexaAudioCheckpointP0.recover({ownerId:A,encounterId:enc,sessionId:ses});return{chunks:x.chunks,finalized:x.finalized,size:x.blob.size}}catch(e){return{err:e.message}}},[A,enc,ses]);
      if(acked===0&&r.err==='AUDIO_NO_DURABLE_CHUNKS'){/* closed before the first chunk landed: nothing was promised */}
      else{assert.ok(!r.err,L('abrupt close round '+round+': recover must verify a contiguous prefix, got '+JSON.stringify(r)));assert.ok(r.chunks>=acked,L('abrupt close: every ACKNOWLEDGED chunk survives ('+r.chunks+'>='+acked+')'));assert.equal(r.finalized,false);assert.equal(r.size,r.chunks*4000)}
      await p2.close();
    }
    ok(L('abrupt close during a serialized chunk chain x6: acknowledged chunks always survive, recovered prefix verifies, session reported as NOT finalized'));

    // 2. tamper / gap detection
    {const p=await open(),enc=id(300),ses=id(301);
      const out=await p.evaluate(async([A,enc,ses])=>{
        const V=window.nexaAudioCheckpointP0,mk=(n,seed)=>new Blob([new Uint8Array(Array.from({length:n},(_,i)=>(i*31+seed)&255))]);
        await V.begin({ownerId:A,encounterId:enc,sessionId:ses,mime:'audio/webm'});for(let s=0;s<4;s++)await V.append({ownerId:A,encounterId:enc,sessionId:ses,sequence:s,blob:mk(500,s)});
        await V.finalize({ownerId:A,encounterId:enc,sessionId:ses,expectedChunkCount:4});
        const db=await new Promise(r=>{const q=indexedDB.open('nexa-audio-checkpoint-p0');q.onsuccess=()=>r(q.result)});
        const edit=fn=>new Promise((ok,bad)=>{const t=db.transaction('chunks','readwrite');fn(t.objectStore('chunks'));t.oncomplete=ok;t.onerror=()=>bad(t.error)});
        const res={};
        // flip one ciphertext byte of chunk 2
        await edit(s=>{const g=s.get(ses+':000002');g.onsuccess=()=>{const row=g.result,u=new Uint8Array(row.ciphertext);u[3]^=1;s.put({...row,ciphertext:u.buffer})}});
        try{await V.recover({ownerId:A,encounterId:enc,sessionId:ses});res.tamper='NOT_DETECTED'}catch(e){res.tamper=e.name+':'+e.message}
        return res},[A,enc,ses]);
      assert.ok(/AUDIO_CHECKPOINT_INTEGRITY_FAILED|OperationError/.test(out.tamper),L('tampered ciphertext must be refused, got '+out.tamper));
      const gap=await p.evaluate(async([A,enc,ses])=>{const V=window.nexaAudioCheckpointP0;
        const db=await new Promise(r=>{const q=indexedDB.open('nexa-audio-checkpoint-p0');q.onsuccess=()=>r(q.result)});
        await new Promise(ok=>{const t=db.transaction('chunks','readwrite');t.objectStore('chunks').delete(ses+':000001');t.oncomplete=ok});
        try{await V.recover({ownerId:A,encounterId:enc,sessionId:ses});return'NOT_DETECTED'}catch(e){return e.message}},[A,enc,ses]);
      assert.ok(/AUDIO_FINALIZED_CHUNK_COUNT_MISMATCH|AUDIO_CHUNK_GAP_OR_SCOPE_MISMATCH/.test(gap),L('missing chunk must be refused, got '+gap));
      await p.close();ok(L('tampered ciphertext and a missing chunk are detected and refused (never returned as audio)'))}

    // 3. quota exhaustion mid-recording
    {const p=await open(),enc=id(400),ses=id(401);
      const out=await p.evaluate(async([A,enc,ses])=>{
        const V=window.nexaAudioCheckpointP0,mk=(n,seed)=>new Blob([new Uint8Array(Array.from({length:n},(_,i)=>(i*31+seed)&255))]);
        await V.begin({ownerId:A,encounterId:enc,sessionId:ses,mime:'audio/webm'});
        const orig=IDBObjectStore.prototype.add;let calls=0;
        IDBObjectStore.prototype.add=function(row){if(this.name==='chunks'&&++calls>=4)throw new DOMException('quota','QuotaExceededError');return orig.apply(this,arguments)};
        const res={ok:[],fail:[]};
        for(let s=0;s<6;s++){try{await V.append({ownerId:A,encounterId:enc,sessionId:ses,sequence:s,blob:mk(800,s)});res.ok.push(s)}catch(e){res.fail.push(e.name)}}
        IDBObjectStore.prototype.add=orig;
        res.recovered=(await V.recover({ownerId:A,encounterId:enc,sessionId:ses})).chunks;
        let fin='none';try{await V.finalize({ownerId:A,encounterId:enc,sessionId:ses,expectedChunkCount:6});fin='finalized-WRONGLY'}catch(e){fin=e.message}
        res.fin=fin;res.finOk=(await V.finalize({ownerId:A,encounterId:enc,sessionId:ses,expectedChunkCount:res.recovered})).chunks;
        res.usage=await V.usage();return res},[A,enc,ses]);
      assert.deepEqual(out.ok,[0,1,2]);assert.ok(out.fail.length===3&&out.fail.every(n=>n==='QuotaExceededError'),L('quota failures surface as errors, never as success'));
      assert.equal(out.recovered,3);assert.equal(out.fin,'AUDIO_EXPECTED_CHUNK_COUNT_MISMATCH',L('finalize refuses to claim chunks that were never stored'));assert.equal(out.finOk,3);
      assert.ok('persisted' in out.usage&&'quota' in out.usage);
      await p.close();ok(L('quota exhaustion: failed chunks raise, the confirmed prefix stays intact and finalizable at its true size, finalize never over-claims'))}

    // 4. user switch isolation
    {const p=await open(),enc=id(500),ses=id(501);
      const out=await p.evaluate(async([A,B,enc,ses])=>{
        const V=window.nexaAudioCheckpointP0,mk=n=>new Blob([new Uint8Array(n).fill(7)]),r={};
        await V.begin({ownerId:A,encounterId:enc,sessionId:ses,mime:'audio/webm'});await V.append({ownerId:A,encounterId:enc,sessionId:ses,sequence:0,blob:mk(300)});
        await V.finalize({ownerId:A,encounterId:enc,sessionId:ses,expectedChunkCount:1});
        r.bList=(await V.listOwned(B)).length;
        const t=async(label,fn)=>{try{await fn();r[label]='ALLOWED'}catch(e){r[label]=e.message}};
        await t('bRecover',()=>V.recover({ownerId:B,encounterId:enc,sessionId:ses}));
        await t('bBeginSame',()=>V.begin({ownerId:B,encounterId:enc,sessionId:ses,mime:'audio/webm'}));
        await t('bAppend',()=>V.append({ownerId:B,encounterId:enc,sessionId:ses,sequence:1,blob:mk(10)}));
        await t('bChunks',()=>V.chunkBuffers({ownerId:B,encounterId:enc,sessionId:ses}));
        await t('bPurge',()=>V.purge({ownerId:B,encounterId:enc,sessionId:ses,reason:'physician_confirmed'}));
        await t('wrongEnc',()=>V.recover({ownerId:A,encounterId:'99999999-0000-4000-8000-000000000001',sessionId:ses}));
        r.aStill=(await V.recover({ownerId:A,encounterId:enc,sessionId:ses})).chunks;return r},[A,B,enc,ses]);
      assert.equal(out.bList,0);for(const k of ['bRecover','bChunks','bPurge','wrongEnc'])assert.equal(out[k],'AUDIO_SESSION_NOT_OWNED',L(k+' must be refused'));assert.equal(out.bAppend,'AUDIO_ACTIVE_SESSION_REQUIRED');
      assert.equal(out.bBeginSame,'AUDIO_SESSION_OWNER_MISMATCH');assert.equal(out.aStill,1);
      await p.close();ok(L('user switch: B cannot list, recover, read chunks, append to, begin on or purge A\'s session; A is untouched'))}

    // 5. ten consecutive consultations + retention rules
    {const p=await open();
      const out=await p.evaluate(async([A,B])=>{
        const V=window.nexaAudioCheckpointP0,mk=(n,s)=>new Blob([new Uint8Array(n).fill(s)]),r={};
        const E=k=>'10000000-0000-4000-8000-'+String(k).padStart(12,'0'),S=k=>'20000000-0000-4000-8000-'+String(k).padStart(12,'0');
        for(let k=1;k<=10;k++){await V.begin({ownerId:A,encounterId:E(k),sessionId:S(k),mime:'audio/webm'});for(let s=0;s<3;s++)await V.append({ownerId:A,encounterId:E(k),sessionId:S(k),sequence:s,blob:mk(100+k,k)});await V.finalize({ownerId:A,encounterId:E(k),sessionId:S(k),expectedChunkCount:3})}
        r.listed=(await V.listOwned(A)).filter(x=>x.encounterId.startsWith('10000000')).length;
        r.distinct=new Set(await Promise.all(Array.from({length:10},async(_,i)=>{const x=await V.recover({ownerId:A,encounterId:E(i+1),sessionId:S(i+1)});return x.blob.size}))).size;
        const t=async(label,fn)=>{try{await fn();r[label]='ALLOWED'}catch(e){r[label]=e.message}};
        await t('noReason',()=>V.purge({ownerId:A,encounterId:E(1),sessionId:S(1)}));
        await t('badReason',()=>V.purge({ownerId:A,encounterId:E(1),sessionId:S(1),reason:'because'}));
        await V.begin({ownerId:A,encounterId:E(11),sessionId:S(11),mime:'audio/webm'});await V.append({ownerId:A,encounterId:E(11),sessionId:S(11),sequence:0,blob:mk(50,9)});
        await t('openSession',()=>V.purge({ownerId:A,encounterId:E(11),sessionId:S(11),reason:'physician_confirmed'}));
        r.p=await V.purge({ownerId:A,encounterId:E(3),sessionId:S(3),reason:'remote_verified'});
        await t('recoverPurged',()=>V.recover({ownerId:A,encounterId:E(3),sessionId:S(3)}));
        r.others=(await Promise.all([1,2,4,5,6,7,8,9,10].map(async k=>(await V.recover({ownerId:A,encounterId:E(k),sessionId:S(k)})).chunks))).every(c=>c===3);
        r.openStill=(await V.recover({ownerId:A,encounterId:E(11),sessionId:S(11)})).chunks;
        // a NEW owner key still works for the same owner after a purge
        await V.begin({ownerId:A,encounterId:E(12),sessionId:S(12),mime:'audio/webm'});await V.append({ownerId:A,encounterId:E(12),sessionId:S(12),sequence:0,blob:mk(20,1)});r.afterPurge='ok';
        return r},[A,B]);
      assert.equal(out.listed,10);assert.equal(out.distinct,10,L('ten consecutive consultations hold distinct audio'));
      assert.equal(out.noReason,'AUDIO_PURGE_REASON_REQUIRED');assert.equal(out.badReason,'AUDIO_PURGE_REASON_REQUIRED');assert.equal(out.openSession,'AUDIO_PURGE_REFUSED_NOT_FINALIZED');
      assert.equal(out.p.purgedChunks,3);assert.equal(out.recoverPurged,'AUDIO_SESSION_NOT_OWNED');assert.ok(out.others);assert.equal(out.openStill,1);assert.equal(out.afterPurge,'ok');
      await p.close();ok(L('ten consecutive consultations stay separate; purge needs a reason, refuses open sessions, removes only its own session'))}

    // 6. offline + replay semantics + persistence request
    {const p=await open();const canOffline=kind!=='webkit';   /* WebKit's offline emulation breaks Blob I/O inside the harness itself (NotReadableError even though the vault never touches the network): the replay/conflict semantics are still checked there, the offline condition is NOT claimed for WebKit */
      if(canOffline)await ctx.setOffline(true);
      const out=await p.evaluate(async([A])=>{const V=window.nexaAudioCheckpointP0,mk=(n,s)=>new Blob([new Uint8Array(n).fill(s)]),e='30000000-0000-4000-8000-000000000001',s='30000000-0000-4000-8000-000000000002',r={};
        await V.begin({ownerId:A,encounterId:e,sessionId:s,mime:'audio/webm'});
        r.a=await V.append({ownerId:A,encounterId:e,sessionId:s,sequence:0,blob:mk(64,5)});r.dup=(await V.append({ownerId:A,encounterId:e,sessionId:s,sequence:0,blob:mk(64,5)})).duplicate===true;
        try{await V.append({ownerId:A,encounterId:e,sessionId:s,sequence:0,blob:mk(64,6)});r.conf='ALLOWED'}catch(x){r.conf=x.message}
        r.again=(await V.begin({ownerId:A,encounterId:e,sessionId:s,mime:'audio/webm'})).existing===true;
        try{await V.begin({ownerId:A,encounterId:e,sessionId:s,mime:'audio/mp4'});r.mime='ALLOWED'}catch(x){r.mime=x.message}
        return r},[A]);
      if(canOffline)await ctx.setOffline(false);
      assert.ok(out.a.readback&&out.dup);assert.equal(out.conf,'AUDIO_SEQUENCE_CONFLICT');assert.ok(out.again);assert.equal(out.mime,'AUDIO_SESSION_MIME_MISMATCH');
      await p.close();ok(L((canOffline?'network offline':'(online only: WebKit offline emulation unusable)')+': the vault needs no network; replayed chunk is idempotent, a different payload for the same sequence is refused, resume of an open session works'))}

    // 7. screen lock / backgrounding: visibility + pagehide + freeze do not affect writes in flight
    {const p=await open(),enc=id(600),ses=id(601);
      const out=await p.evaluate(async([A,enc,ses])=>{const V=window.nexaAudioCheckpointP0,mk=(n,s)=>new Blob([new Uint8Array(n).fill(s)]);
        await V.begin({ownerId:A,encounterId:enc,sessionId:ses,mime:'audio/webm'});
        const pend=[];for(let s=0;s<5;s++){pend.push(V.append({ownerId:A,encounterId:enc,sessionId:ses,sequence:s,blob:mk(256,s)}));
          if(s===2){Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('freeze'))}}
        const settled=await Promise.allSettled(pend);return{settled:settled.map(x=>x.status),rec:(await V.recover({ownerId:A,encounterId:enc,sessionId:ses})).chunks}},[A,enc,ses]);
      assert.ok(out.settled.every(x=>x==='fulfilled')||out.rec===out.settled.filter(x=>x==='fulfilled').length);
      await p.close();ok(L('simulated screen lock (visibility hidden + pagehide + freeze events) does not corrupt in-flight appends. NOTE: events are simulated; a real OS suspend is NOT covered'))}
    return true;
  }finally{await browser.close()}
}
server.listen(0,'127.0.0.1',async()=>{
  const port=server.address().port;let code=0;
  const which=process.argv[2]||'both';try{if(which!=='webkit')await suite('chromium',port);if(which!=='chromium')await suite('webkit',port);console.log('AUDIO_VAULT_RESILIENCE_PASS (emulated Chromium + WebKit; not iOS/Android device evidence), '+results.length+' checks')}
  catch(e){console.error('AUDIO_VAULT_RESILIENCE_FAIL',e&&e.stack||e);code=1}
  server.close();process.exit(code);
});
