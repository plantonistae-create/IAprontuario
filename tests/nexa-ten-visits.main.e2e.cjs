// V5.19 MAIN-TREE VARIANT of the ten-visits test: runs on main + incremental patches (no Draft, no Gate C containment). Mode via argv[4]: default (flag OFF = production) | enforce (assistAuthority=true + synthetic issuer).
// V5.18: ten (configurable) CONSECUTIVE synthetic consultations on the REAL page (fixtures stand in for Supabase/AI only), in Chromium and WebKit.
// Proves per-visit separation (no carry-over in form, Radar, recorder, processed meta), unique encounter identities, a server-side history with exactly one row per
// visit containing ONLY its own marker, local records synced without conflicts, and that Gate C containment holds (no audit submission leaves the browser).
// Usage: NODE_PATH=... node tests/nexa-ten-visits.e2e.cjs [chromium|webkit|both] [visits]
const {chromium,webkit}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const which=process.argv[2]||'both',VISITS=Number(process.argv[3]||10),MODE=process.argv[4]||'default',NOHDR=process.argv[5]==='nohdr';   // nohdr: tree WITHOUT the incremental patches (plain main)
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const KEYS=['queixa_principal','hda','antecedentes','alergias','comorbidades','medicacoes','exame_fisico','sinais_vitais','hipotese_diagnostica','conduta'];
const watchdog=setTimeout(()=>{console.error('ten-visits exceeded 900 s');process.exit(1)},900000);watchdog.unref();
// WebKit has no fake capture device: the DEVICE is replaced by a WebAudio oscillator stream; MediaRecorder, IndexedDB, WebCrypto and the page code are real.
const syntheticMic=()=>{const fake=async()=>{const c=new (window.AudioContext||window.webkitAudioContext)();(window.__ctxs=window.__ctxs||[]).push(c);c.resume().catch(()=>{});const o=c.createOscillator(),d=c.createMediaStreamDestination();o.connect(d);o.start();return d.stream};try{Object.defineProperty(MediaDevices.prototype,'getUserMedia',{value:fake,configurable:true,writable:true})}catch{}try{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:fake,configurable:true,writable:true})}catch{}};
async function run(kind,viewport,port){
  const launcher=kind==='webkit'?webkit:chromium;
  const browser=await launcher.launch(kind==='webkit'?{headless:true}:{headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const label=MODE+' '+kind+' '+viewport.width+'px';
  try{
    const page=await browser.newPage(kind==='webkit'?{viewport}:{viewport,permissions:['microphone']});page.setDefaultTimeout(30000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    if(kind==='webkit')await page.addInitScript(syntheticMic);
    // WebKit only resumes an AudioContext from a driver-initiated call
    const pump=(async()=>{while(!page.isClosed()){await page.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
    await page.addInitScript(()=>{window.__qaAuthority={calls:[],attest:async(e)=>{window.__qaAuthority.calls.push(['attest',e]);return{evidence_only:true,external_ai_authorized:false}},grant:async(e,p)=>{window.__qaAuthority.calls.push(['grant',e,p]);return{authorized:true,grant_id:'cccccccc-0000-4000-8000-0000000000c1',purpose:p,encounter_id:e,external_ai_authorized:false}},verify:async(e,p)=>{window.__qaAuthority.calls.push(['verify',e,p]);return{authorized:true,grant_id:'cccccccc-0000-4000-8000-0000000000c1',purpose:p,encounter_id:e,server_now:new Date().toISOString(),expires_at:new Date(Date.now()+3600e3).toISOString()}}}});
    await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaAuditOutbox18919&&document.getElementById('nfStart'));
    if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
    await page.evaluate(mode=>{window.__hdr=[];const f=window.fetch;window.fetch=function(i,init){try{if(String(i).includes('/functions/v1/'))window.__hdr.push({u:String(i),h:Object.assign({},init&&init.headers)})}catch{}return f.call(this,i,init)};
      if(mode==='enforce'&&window.nexaAssistAuthorityV514)window.nexaAssistAuthorityV514.configure(window.__qaAuthority)},MODE);   // enforce: the served page has assistAuthority:true + synthetic server issuer; default: production configuration (flag OFF, nothing configured)
    if(!NOHDR)assert.equal(await page.evaluate(()=>window.nexaAssistAuthorityV514.configured()),MODE==='enforce');
    const marks=[],ids=[];
    for(let k=1;k<=VISITS;k++){
      const mark='SINT-'+String(k).padStart(2,'0')+'-'+(1000+k*7);marks.push(mark);
      // ---- no carry-over from the previous visit
      const pre=await page.evaluate(k=>({vals:Object.fromEntries(['queixa_principal','hda','antecedentes','alergias','comorbidades','medicacoes','exame_fisico','sinais_vitais','hipotese_diagnostica','conduta'].map(x=>[x,(document.querySelector('.field[data-key="'+x+'"] textarea')||{}).value||''])),ledger:Object.keys(window.nexaRadar.snapshot().ledger||{}).length,meta:!!window.lastProcessedMeta,rec:document.getElementById('recBtn').dataset.recordingState,timer:document.getElementById('timer').textContent,id:window.nexaEncounterAutosave18101.currentEncounterId(),phase:document.body.dataset.nexaClinicalPhase}),k);
      assert.ok(Object.values(pre.vals).every(v=>!v.trim()),label+' visit '+k+': form must start empty, got '+JSON.stringify(pre.vals).slice(0,120));
      assert.equal(pre.ledger,0,label+' visit '+k+': Radar ledger must start empty');assert.equal(pre.meta,false,label+' visit '+k+': no processed meta carried over');
      assert.equal(pre.rec,'idle',label+' visit '+k+': recorder idle');assert.equal(pre.timer,'00:00');assert.equal(pre.phase,'consult');
      
      // ---- record
      if(!(await page.locator('#consent').isChecked()))await page.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
      await page.locator('#nfStart').click();await page.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));
      await page.locator('.field[data-key="sinais_vitais"] textarea').evaluate((el,m)=>{el.value='PA 120x80 '+m;el.dispatchEvent(new Event('input',{bubbles:true}))},mark);
      const vid=await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());assert.ok(vid&&!ids.includes(vid),label+' visit '+k+': this visit must have its OWN encounter id (got '+vid+')');ids.push(vid);
      await sleep(1300);await page.locator('#nfFinish').click();
      await page.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/pront[oa] para transcrever/i.test(document.getElementById('status')?.textContent||''));
      // ---- structure
      await page.locator('#nfProcess').click();
      await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
      // physician edit AFTER structuring carries the visit marker
      await page.locator('.field[data-key="exame_fisico"] textarea').evaluate((el,m)=>{el.value='Exame '+m;el.dispatchEvent(new Event('input',{bubbles:true}))},mark);
      // server must hold THIS visit (marker present) before we leave it
      await page.waitForFunction(([id,m])=>window.__qa.consultationRows.some(r=>String(r.encounter_id)===id&&JSON.stringify(r.fields).includes(m)),[vid,mark],{timeout:30000});
      // ---- next consultation (the last visit stays on screen)
      if(k<VISITS){
        // V5.21 (F1 only): main refuses "Novo atendimento" while data-recording-state is still stale (<=1 s after structuring); a physician simply retries.
        for(let t=0;t<30;t++){await page.locator('#resetBtn').evaluate(el=>el.click());if(await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value,null,{timeout:700}).then(()=>true,()=>false))break}
        await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value);
      }
    }
    // ---- final integrity
    await sleep(1500);
    const owner=await page.evaluate(()=>window.currentProf.id);
    const out=await page.evaluate(async()=>{const all=await window.nexaEncounterAutosave18101.all();return{rpcNames:window.__qa.rpcNames||[],rows:window.__qa.consultationRows.map(r=>({enc:String(r.encounter_id),id:String(r.id),user:r.user_id,sv:r.sync_version,st:r.encounter_state,body:JSON.stringify(r.fields)+JSON.stringify(r.processing_meta||{})})),local:all.map(r=>({enc:r.encounter_id,st:r.sync_state,owner:r.owner_user_id,body:JSON.stringify(r.fields)})),audits:window.__qa.auditSubmissions.length,overlayOpen:!!document.querySelector('.nexa-c-overlay:not([hidden])'),outbox:(await window.nexaAuditOutbox18919.all()).map(x=>x.state),calls:window.__qaAuthority.calls.length,hdr:window.__hdr,reqs:window.__qa.requests.filter(r=>/process-consultation|realtime-radar/.test(r.url)).length,auditRows:window.__qa.auditSubmissions.map(x=>JSON.stringify(x))}});
    assert.equal(out.rows.length,VISITS,label+': exactly one server row per visit');assert.equal(new Set(out.rows.map(r=>r.enc)).size,VISITS,label+': distinct encounter ids on the server');
    assert.equal(new Set(ids).size,VISITS);
    marks.forEach((m,i)=>{const r=out.rows.find(x=>x.enc===ids[i]);assert.ok(r,label+' row for visit '+(i+1));assert.ok(r.body.includes(m),label+' visit '+(i+1)+' keeps its own marker');
      marks.forEach((o,j)=>{if(j!==i)assert.ok(!r.body.includes(o),label+' visit '+(i+1)+' must NOT contain visit '+(j+1)+' marker')});
      assert.equal(r.user,owner);assert.ok(Number(r.sv)>=1);assert.equal(r.st,'ready_for_audit')});
    assert.equal(out.local.length,VISITS,label+': one local record per visit');
    out.local.forEach(l=>{const i=ids.indexOf(l.enc);assert.ok(i>=0,label+' local record belongs to a known visit');assert.ok(['synced',undefined].includes(l.st),label+' local record synced, got '+l.st);if(l.owner!==undefined)assert.equal(l.owner,owner);
      marks.forEach((o,j)=>{if(j!==i)assert.ok(!l.body.includes(o),label+' local visit '+(i+1)+' must not contain marker '+(j+1))})});
    // MAIN has no Gate C containment: audit hand-off is whatever production does today. We only assert it is PER VISIT (no cross-contamination) and there is no conflict overlay.
    out.auditRows.forEach(a=>{const own=marks.filter(m=>a.includes(m));assert.ok(own.length<=1,label+': an audit submission contains markers of more than one visit')});
    assert.equal(out.overlayOpen,false,label+': no conflict overlay');
    const withHeader=out.hdr.filter(h=>/process-consultation|realtime-radar|realtime-call/.test(h.u));
    if(!NOHDR&&MODE==='enforce'){withHeader.forEach(h=>assert.ok(ids.includes(String(h.h['x-nexa-encounter-id']||h.h['X-Nexa-Encounter-Id'])),label+': every AI call carries the encounter id of ITS visit ('+h.u.slice(-22)+')'));
      assert.ok(withHeader.length>=VISITS,label+': at least one AI call per visit carried the header ('+withHeader.length+')')}
    // V5.27 WIRE GUARD (production config, flags OFF): the hosted Edge CORS (== main) allows ONLY authorization, x-client-info, apikey, content-type. Any other request header on a function call would fail the browser preflight and break assistance.
    if(!NOHDR&&MODE==='default'){const ALLOWED=['authorization','x-client-info','apikey','content-type'];out.hdr.forEach(h=>Object.keys(h.h||{}).forEach(k=>assert.ok(ALLOWED.includes(k.toLowerCase()),label+': header "'+k+'" on '+h.u.slice(-26)+' is NOT allowed by the hosted CORS')));
      assert.ok(!out.hdr.some(h=>/audio-backup/.test(h.u)),label+': no call to audio-backup with flags OFF');assert.ok(!out.rpcNames.some(n=>/^nexa_(assist|capture|audio|admin)/.test(n)),label+': no nexa_* RPC with flags OFF ('+out.rpcNames.filter(n=>/^nexa_/.test(n)).join(',')+')')}
    if(NOHDR){}else if(MODE==='enforce')assert.ok(out.calls>=VISITS*3,label+': the synthetic issuer was asked for every visit (attest+grant+verify)');else assert.equal(out.calls,0,label+': flag OFF = no authority call at all (production unchanged)');
    const real=errors.filter(e=>!/ResizeObserver|Non-Error promise rejection/.test(e));assert.deepEqual(real,[],label+': page errors');
    console.log(label+': '+VISITS+' consecutive consultations PASS (ids distinct, rows '+out.rows.length+', local '+out.local.length+', audit hand-offs '+out.auditRows.length+', AI calls with own encounter header '+withHeader.length+')');
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html')body=body.toString().replace('assistAuthority:false','assistAuthority:'+(MODE==='enforce')).replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{
    if(which!=='webkit'){await run('chromium',{width:1440,height:1000},port);await run('chromium',{width:390,height:844},port)}
    if(which!=='chromium'){await run('webkit',{width:1280,height:900},port);await run('webkit',{width:390,height:844},port)}
    console.log('TEN_VISITS_PASS');
  }catch(e){console.error(e&&e.stack||e);process.exit(1)}finally{server.close()}
})();
