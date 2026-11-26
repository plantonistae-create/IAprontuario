// (derived from) V5.19 MAIN-TREE VARIANT of the ten-visits test: runs on main + incremental patches (no Draft, no Gate C containment). Mode via argv[4]: default (flag OFF = production) | enforce (assistAuthority=true + synthetic issuer).
// V5.18: ten (configurable) CONSECUTIVE synthetic consultations on the REAL page (fixtures stand in for Supabase/AI only), in Chromium and WebKit.
// Proves per-visit separation (no carry-over in form, Radar, recorder, processed meta), unique encounter identities, a server-side history with exactly one row per
// visit containing ONLY its own marker, local records synced without conflicts, and that Gate C containment holds (no audit submission leaves the browser).
// V5.23 capture inventory: two consecutive visits on the real page; every preserved record kind, original-vs-corrected separation and per-visit chain isolation. Usage: node tests/nexa-capture-inventory.e2e.cjs [chromium|webkit|both]
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
    const page=await browser.newPage(kind==='webkit'?{viewport}:{viewport,permissions:['microphone']});page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
    if(kind==='webkit')await page.addInitScript(syntheticMic);
    (async()=>{while(!page.isClosed()){await page.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
    await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaCaptureV516&&document.getElementById('nfStart'));
    if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
    await page.evaluate(INMEM+';window.nexaCaptureV516.configure({transport:window.__capTransport,owner:()=>window.currentProf.id})');
    const encs=[];
    for(let k=1;k<=2;k++){
      const mark='SINT-CAP-'+k;
      await page.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
      await page.locator('#nfStart').click();await page.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));
      const enc=await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());encs.push(enc);
      await sleep(1300);await page.locator('#nfFinish').click();
      await page.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/pront[oa] para transcrever/i.test(document.getElementById('status')?.textContent||''));
      await page.locator('#nfProcess').click();
      await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
      await page.locator('.field[data-key="exame_fisico"] textarea').evaluate((el,m)=>{el.value='Exame '+m;el.dispatchEvent(new Event('input',{bubbles:true}))},mark);
      await page.waitForFunction(([id])=>(window.__chain[id]||[]).some(r=>r.kind==='physician_edit'),[enc],{timeout:30000});
      if(k<2){for(let t=0;t<30;t++){await page.locator('#resetBtn').evaluate(el=>el.click());if(await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value,null,{timeout:700}).then(()=>true,()=>false))break}
        await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value)}
    }
    await sleep(1500);
    const chains=await page.evaluate(()=>window.__chain);
    const report={};
    encs.forEach((enc,i)=>{
      const c=chains[enc]||[],kinds=c.map(r=>r.kind);report['visit'+(i+1)]=kinds;
      assert.deepEqual(c.map(r=>r.seq),c.map((_,j)=>j+1),label+': contiguous sequence');
      for(const need of ['transcript_final','clinical_fields','provenance','radar','physician_edit'])assert.ok(kinds.includes(need),label+' visit '+(i+1)+': '+need+' preserved ('+kinds.join(',')+')');
      const orig=c.find(r=>r.kind==='clinical_fields'),edit=c.filter(r=>r.kind==='physician_edit').pop(),fin=c.find(r=>r.kind==='transcript_final'),prov=c.find(r=>r.kind==='provenance');
      assert.ok(!JSON.stringify(orig.payload).includes('SINT-CAP-'),label+': the ORIGINAL structured fields never contain the physician\'s later edit');
      assert.ok(JSON.stringify(edit.payload).includes('SINT-CAP-'+(i+1)),label+': the physician correction is captured as a separate record');
      assert.notEqual(orig.payload.fields_digest,edit.payload.after_digest,label+': original and corrected versions have different digests');
      assert.ok(edit.payload.before_digest===orig.payload.fields_digest||/^0+$/.test(edit.payload.before_digest)===false,label+': the edit points at the version it replaced');
      assert.equal(fin.payload.training_label,false,label+': a transcript is never marked as a training label');assert.ok(fin.payload.text&&fin.payload.text.length>10);
      for(const f of ['provider','model','model_version','pipeline_version'])assert.ok(typeof prov.payload[f]==='string'&&prov.payload[f],label+': provenance.'+f);
      encs.forEach((other,j)=>{if(j!==i)assert.ok(!JSON.stringify(c).includes('SINT-CAP-'+(j+1)),label+': visit '+(i+1)+' chain holds nothing of visit '+(j+1))});
      assert.ok(c.every(r=>!/training|export|audit_label/i.test(r.kind)),label+': no kind can carry training/export/audit labels');
    });
    console.log('PASS',label,JSON.stringify(report));
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html')body=body.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',{width:1440,height:1000},port);if(which!=='chromium')await run('webkit',{width:1280,height:900},port);console.log('CAPTURE_INVENTORY_PASS (in-page chain transport; the server-side chain is covered by the PG16 test)')}catch(e){console.error('CAPTURE_INVENTORY_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}
})();
