// (derived from) V5.19 MAIN-TREE VARIANT of the ten-visits test: runs on main + incremental patches (no Draft, no Gate C containment). Mode via argv[4]: default (flag OFF = production) | enforce (assistAuthority=true + synthetic issuer).
// V5.18: ten (configurable) CONSECUTIVE synthetic consultations on the REAL page (fixtures stand in for Supabase/AI only), in Chromium and WebKit.
// Proves per-visit separation (no carry-over in form, Radar, recorder, processed meta), unique encounter identities, a server-side history with exactly one row per
// visit containing ONLY its own marker, local records synced without conflicts, and that Gate C containment holds (no audit submission leaves the browser).
// V5.24 Radar capture on the real page: every published suggestion (origin, versions), the physician's response, undo/re-answer correction and alert review. Usage: node tests/nexa-radar-capture.e2e.cjs [chromium|webkit|both]
const {chromium,webkit}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const which=process.argv[2]||'both';   // nohdr: tree WITHOUT the incremental patches (plain main)
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const KEYS=['queixa_principal','hda','antecedentes','alergias','comorbidades','medicacoes','exame_fisico','sinais_vitais','hipotese_diagnostica','conduta'];
const watchdog=setTimeout(()=>{console.error('ten-visits exceeded 900 s');process.exit(1)},900000);watchdog.unref();
// WebKit has no fake capture device: the DEVICE is replaced by a WebAudio oscillator stream; MediaRecorder, IndexedDB, WebCrypto and the page code are real.
const syntheticMic=()=>{const fake=async()=>{const c=new (window.AudioContext||window.webkitAudioContext)();(window.__ctxs=window.__ctxs||[]).push(c);c.resume().catch(()=>{});const o=c.createOscillator(),d=c.createMediaStreamDestination();o.connect(d);o.start();return d.stream};try{Object.defineProperty(MediaDevices.prototype,'getUserMedia',{value:fake,configurable:true,writable:true})}catch{}try{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:fake,configurable:true,writable:true})}catch{}};

const INMEM=`window.__chain={};window.__capLog=[];window.__capTransport={
 append:async(e,k,p,s)=>{const c=(window.__chain[e]=window.__chain[e]||[]);const next=c.length+1;
   if(s!==next){return{appended:false,reason:'SEQUENCE_CONFLICT',next_seq:next}}
   const r={seq:s,kind:k,payload:JSON.parse(JSON.stringify(p)),record_digest:'d'+e.slice(0,6)+s,at:Date.now()};c.push(r);window.__capLog.push(k);return{appended:true,seq:s,record_digest:r.record_digest}},
 readChain:async e=>JSON.parse(JSON.stringify(window.__chain[e]||[])),verifyChain:async e=>({valid:true,records:(window.__chain[e]||[]).length})}`;

async function run(kind,viewport,port){
  const launcher=kind==='webkit'?webkit:chromium;
  const browser=await launcher.launch(kind==='webkit'?{headless:true}:{headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const label=kind+' '+viewport.width+'px';
  try{
    const page=await browser.newPage(kind==='webkit'?{viewport}:{viewport,permissions:['microphone']});page.setDefaultTimeout(40000);page.on('dialog',d=>d.accept());
    if(kind==='webkit')await page.addInitScript(syntheticMic);
    (async()=>{while(!page.isClosed()){await page.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
    await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaCaptureV516&&window.nexaRadarCaptureV524&&document.getElementById('nfStart'));
    if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
    await page.evaluate(INMEM+';window.nexaCaptureV516.configure({transport:window.__capTransport,owner:()=>window.currentProf.id})');
    await page.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
    await page.locator('#nfStart').click();await page.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));
    const enc=await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());
    await sleep(1300);await page.locator('#nfFinish').click();
    await page.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/pront[oa] para transcrever/i.test(document.getElementById('status')?.textContent||''));
    await page.locator('#nfProcess').click();
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
    await page.waitForFunction(([e])=>(window.__chain[e]||[]).filter(r=>r.kind==='radar'&&r.payload.event==='suggestion_displayed').length>=3,[enc],{timeout:30000});
    const shown=await page.evaluate(()=>{const s=window.radarState||window.nexaRadar.state,o=[];for(const l of ['items','alerts','confirm'])for(const it of s[l]||[])o.push(l+'|'+it.id);return o});
    assert.ok(shown.length>=3);
    // physician acts: answer, retract, answer differently, review an alert
    const act=await page.evaluate(()=>{const R=window.nexaRadar,o={};o.a=R.respond('focal','Sem déficit neurológico focal','answer');o.u=R.undoLast();o.b=R.respond('focal','Paresia leve em membro superior direito','answer');const al=(R.state.alerts||[])[0];o.al=al?al.id:null;return o});
    assert.equal(act.a,true,label+': answer accepted');assert.equal(act.u,true,label+': undo accepted');assert.equal(act.b,true,label+': second answer accepted');
    await page.waitForFunction(([e])=>{const c=(window.__chain[e]||[]).filter(r=>r.kind==='radar').map(r=>r.payload.event);return c.filter(x=>x==='physician_response').length>=2&&c.includes('physician_response_undone')},[enc],{timeout:30000});
    // alert lifecycle: the documented finding disappears from the note -> alert becomes pending -> the physician reviews it with a justification
    assert.ok(act.al,label+': an alert was published');
    await page.locator('.field[data-key="hda"] textarea').evaluate(el=>{el.value='Cefaleia desde hoje. Sem demais queixas.';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await page.waitForFunction(id=>(window.nexaRadar.state.alertJournal||[]).some(a=>a.id===id&&a.status==='pending'),act.al,{timeout:20000});
    assert.equal(await page.evaluate(id=>window.nexaRadar.reviewAlert(id,'Avaliado clinicamente: sem sinais de alarme associados'),act.al),true,label+': review accepted');
    await page.waitForFunction(([e])=>(window.__chain[e]||[]).some(r=>r.kind==='radar'&&r.payload.event==='alert_status'&&r.payload.status==='reviewed'),[enc],{timeout:20000});
    await sleep(1500);
    const chain=(await page.evaluate(()=>window.__chain))[enc],radar=chain.filter(r=>r.kind==='radar'),ev=radar.map(r=>r.payload.event);
    assert.deepEqual(chain.map(r=>r.seq),chain.map((_,j)=>j+1),label+': contiguous chain');
    const disp=radar.filter(r=>r.payload.event==='suggestion_displayed'||r.payload.event==='suggestion_changed');
    const dispKeys=new Set(disp.map(r=>r.payload.list+'|'+r.payload.suggestion_id));
    for(const k of shown)assert.ok(dispKeys.has(k),label+': published suggestion '+k+' was captured');
    for(const r of disp){const p=r.payload;assert.ok(p.source&&p.source!=='unreported'||p.list==='alerts',label+': origin recorded for '+p.suggestion_id);assert.ok(p.question&&p.reason!==undefined&&p.priority&&p.displayed_at&&p.radar_state_version!==undefined,label+': text, priority, time, state version')}
    assert.ok(disp.some(r=>r.payload.source==='rule'),label+': rule-engine origin kept');
    const alertShown=disp.find(r=>r.payload.list==='alerts');if(alertShown)assert.ok(alertShown.payload.evidence.length>0&&alertShown.payload.evidence[0].quote,label+': an alert keeps the evidence quote that triggered it');
    const resp=radar.filter(r=>r.payload.event==='physician_response'),und=radar.find(r=>r.payload.event==='physician_response_undone');
    assert.equal(resp[0].payload.value,'Sem déficit neurológico focal');assert.equal(resp[0].payload.is_correction,false);
    assert.equal(und.payload.previous.value,'Sem déficit neurológico focal',label+': the retracted answer is preserved');
    assert.equal(resp.at(-1).payload.value,'Paresia leve em membro superior direito');assert.ok(radar.indexOf(und)>radar.indexOf(resp[0])&&radar.indexOf(resp.at(-1))>radar.indexOf(und),label+': order response → undo → corrected response');
    {const st=radar.filter(r=>r.payload.event==='alert_status'&&r.payload.suggestion_id===act.al);assert.deepEqual(st.map(r=>r.payload.status),['pending','reviewed'],label+': alert lifecycle recorded in order');assert.equal(st[1].payload.previous_status,'pending');assert.match(st[1].payload.reason,/sem sinais de alarme/,label+': the physician\'s justification is preserved')}
    assert.ok(radar.every(r=>!/training|label/i.test(JSON.stringify(Object.keys(r.payload)))),label+': no label/training fields');
    // reload-safety: replaying the same published state records nothing new
    const before=radar.length;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('nexa:radar-state',{detail:{state:window.radarState||window.nexaRadar.state,reason:'replay'}})));await sleep(1200);
    assert.equal((await page.evaluate(([e])=>window.__chain[e].filter(r=>r.kind==='radar').length,[enc])),before,label+': replay is idempotent');
    console.log('PASS',label,JSON.stringify({displayed:disp.length,responses:resp.length,undone:1,alert:act.al,events:[...new Set(ev)]}));
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html')body=body.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',{width:1440,height:1000},port);if(which!=='chromium')await run('webkit',{width:1280,height:900},port);console.log('RADAR_CAPTURE_PASS (in-page chain transport; emulated browsers)')}catch(e){console.error('RADAR_CAPTURE_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}
})();
