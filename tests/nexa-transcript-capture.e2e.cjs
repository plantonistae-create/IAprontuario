// (derived from) V5.19 MAIN-TREE VARIANT of the ten-visits test: runs on main + incremental patches (no Draft, no Gate C containment). Mode via argv[4]: default (flag OFF = production) | enforce (assistAuthority=true + synthetic issuer).
// V5.18: ten (configurable) CONSECUTIVE synthetic consultations on the REAL page (fixtures stand in for Supabase/AI only), in Chromium and WebKit.
// Proves per-visit separation (no carry-over in form, Radar, recorder, processed meta), unique encounter identities, a server-side history with exactly one row per
// visit containing ONLY its own marker, local records synced without conflicts, and that Gate C containment holds (no audit submission leaves the browser).
// V5.24 transcript capture: provisional snapshots while recording, final transcript, and the explicit physician correction (separate versioned `transcript_corrected`). Usage: node tests/nexa-transcript-capture.e2e.cjs [chromium|webkit|both]
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
    await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaCaptureV516&&window.nexaTranscriptV524&&document.getElementById('nfStart'));
    if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
    await page.evaluate(INMEM+';window.nexaCaptureV516.configure({transport:window.__capTransport,owner:()=>window.currentProf.id})');
    const encs=[],LIVE1='Paciente refere cefaleia desde ontem. Nega febre.',LIVE2=' Sem vômitos, pressão cento e vinte por oitenta.';
    for(let k=1;k<=2;k++){
      await page.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
      await page.locator('#nfStart').click();await page.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));
      const enc=await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());encs.push(enc);
      await page.waitForFunction(()=>window.__qa.channels.length>0,null,{timeout:20000});
      const feed=(id,t)=>page.evaluate(([id,t])=>{const ch=window.__qa.channels.at(-1);ch.receive({data:JSON.stringify({type:'input_audio_buffer.committed',item_id:id})});ch.receive({data:JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:t})})},[id,t]);
      await feed('v'+k+'a',LIVE1+' (v'+k+')');
      // first provisional snapshot is taken on the next 10 s chunk; wait for it, then add more text and stop (stop-time snapshot)
      await page.waitForFunction(([e])=>(window.__chain[e]||[]).some(r=>r.kind==='transcript_provisional'),[enc],{timeout:30000});
      await feed('v'+k+'b',LIVE2);await sleep(300);await page.locator('#nfFinish').click();
      await page.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/pront[oa] para transcrever/i.test(document.getElementById('status')?.textContent||''));
      await page.waitForFunction(([e])=>(window.__chain[e]||[]).filter(r=>r.kind==='transcript_provisional').length>=2,[enc],{timeout:20000});
      await page.locator('#nfProcess').click();
      await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
      await page.waitForFunction(([e])=>(window.__chain[e]||[]).some(r=>r.kind==='transcript_final'),[enc],{timeout:20000});
      // ---- explicit correction UI
      const panel=page.locator('#nexaTranscriptPanel');await panel.waitFor({state:'attached'});await page.evaluate(()=>{document.getElementById('nexaTranscriptPanel').open=true});
      assert.ok(await panel.isVisible(),label+' visit '+k+': the transcript review panel is visible in the review phase');
      const orig=await page.locator('#nexaTranscriptText').inputValue();assert.match(orig,/cefaleia desde hoje/,label+': shows the server (final) transcript');
      assert.equal(await page.locator('#nexaTranscriptText').evaluate(e=>e.readOnly),true,label+': read-only until the physician asks to edit');
      await page.locator('#nexaTranscriptEdit').click();
      // cancel writes nothing
      await page.locator('#nexaTranscriptText').fill('RASCUNHO NAO REGISTRADO');await page.locator('#nexaTranscriptCancel').click();await sleep(600);
      assert.ok(!(await page.evaluate(([e])=>JSON.stringify(window.__chain[e]),[enc])).includes('RASCUNHO NAO REGISTRADO'),label+': cancelled edit is never captured');
      assert.equal(await page.locator('#nexaTranscriptText').inputValue(),orig,label+': cancel restores the text');
      // unchanged save writes nothing; real save writes a separate record
      await page.locator('#nexaTranscriptEdit').click();await page.locator('#nexaTranscriptSave').click();assert.match(await page.locator('#nexaTranscriptState').innerText(),/Nenhuma alteração/);
      const c1=orig.replace('cefaleia desde hoje','cefaleia desde ontem')+' (corr'+k+'a)';await page.locator('#nexaTranscriptText').fill(c1);await page.locator('#nexaTranscriptSave').click();
      await page.waitForFunction(([e])=>(window.__chain[e]||[]).filter(r=>r.kind==='transcript_corrected').length===1,[enc],{timeout:20000});
      await page.locator('#nexaTranscriptEdit').click();const c2=c1+' [corr'+k+'b]';await page.locator('#nexaTranscriptText').fill(c2);await page.locator('#nexaTranscriptSave').click();
      await page.waitForFunction(([e])=>(window.__chain[e]||[]).filter(r=>r.kind==='transcript_corrected').length===2,[enc],{timeout:20000});
      assert.match(await page.locator('#nexaTranscriptState').innerText(),/Correção 2 registrada/);
      if(k<2){for(let t=0;t<30;t++){await page.locator('#resetBtn').evaluate(el=>el.click());if(await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value,null,{timeout:700}).then(()=>true,()=>false))break}
        await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value);
        await page.waitForFunction(()=>{const p=document.getElementById('nexaTranscriptPanel');return !p||p.hidden||getComputedStyle(p).display==='none'||!p.offsetParent},null,{timeout:8000});}
    }
    await sleep(800);const chains=await page.evaluate(()=>window.__chain),sha=async t=>require('crypto').createHash('sha256').update(t).digest('hex');
    const report={};
    for(let i=0;i<encs.length;i++){
      const c=chains[encs[i]],kinds=c.map(r=>r.kind);report['visit'+(i+1)]=kinds;const k=i+1;
      assert.deepEqual(c.map(r=>r.seq),c.map((_,j)=>j+1),label+': contiguous');
      const prov=c.filter(r=>r.kind==='transcript_provisional'),fin=c.find(r=>r.kind==='transcript_final'),cor=c.filter(r=>r.kind==='transcript_corrected');
      assert.ok(prov.length>=2,label+': provisional snapshots while recording and at stop ('+prov.length+')');assert.deepEqual(prov.map(r=>r.payload.snapshot),prov.map((_,j)=>j+1),label+': snapshots numbered');
      assert.ok(prov.every(r=>r.payload.provisional===true&&/^[0-9a-f]{64}$/.test(r.payload.text_digest)),label+': provisional flagged + digest');
      assert.equal(new Set(prov.map(r=>r.payload.text_digest)).size,prov.length,label+': unchanged text is never re-recorded');
      assert.ok(prov[0].payload.text.includes('(v'+k+')')&&!prov[0].payload.text.includes(LIVE2.trim()),label+': first snapshot = early text only');assert.ok(prov.at(-1).payload.text.includes('pressão cento e vinte'),label+': last snapshot has the full live text');
      assert.equal(fin.payload.training_label,false);assert.equal(fin.payload.text_digest,await sha(fin.payload.text),label+': final digest matches its text');
      assert.equal(cor.length,2);assert.equal(cor[0].payload.base_digest,fin.payload.text_digest,label+': correction 1 is based on the FINAL transcript');assert.equal(cor[0].payload.previous_digest,fin.payload.text_digest);assert.equal(cor[0].payload.version,1);
      assert.equal(cor[1].payload.previous_digest,cor[0].payload.corrected_digest,label+': correction 2 chains to correction 1');assert.equal(cor[1].payload.base_digest,fin.payload.text_digest);assert.equal(cor[1].payload.version,2);
      for(const r of cor){assert.equal(r.payload.corrected_digest,await sha(r.payload.text));assert.equal(r.payload.training_label,false);assert.equal(r.payload.editor,'physician');assert.notEqual(r.payload.text,fin.payload.text)}
      assert.ok(!fin.payload.text.includes('corr'+k),label+': the FINAL record is never altered by corrections');
      assert.ok(c.indexOf(fin)<c.indexOf(cor[0]),label+': correction comes after the final');
      encs.forEach((o,j)=>{if(j!==i)assert.ok(!JSON.stringify(c).includes('(v'+(j+1)+')')&&!JSON.stringify(c).includes('corr'+(j+1)),label+': no text of the other visit')});
    }
    console.log('PASS',label,JSON.stringify(report));
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html')body=require('./helpers/pilot.cjs').apply(body.toString()).replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',{width:1440,height:1000},port);if(which!=='chromium')await run('webkit',{width:1280,height:900},port);console.log('TRANSCRIPT_CAPTURE_PASS (in-page chain transport; emulated browsers)')}catch(e){console.error('TRANSCRIPT_CAPTURE_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}
})();
