// V5.20 HOTFIX F0+F1 — cross-consultation contamination guard on the REAL page (fixtures stand in for Supabase/AI only), Chromium and WebKit.
// The legacy audit-capture writer (nexa-ui-v3.js persistVersions) used to read the VISIBLE form with the audit state of a PREVIOUS consultation and write it into that
// consultation's history row. Scenarios: S1 debounced persist armed then reset; S2 request in flight on a slow network; S3 user switch; S4 reset hand-off keeps the FROZEN final.
// Usage: node tests/nexa-cross-consultation-guard.e2e.cjs [chromium|webkit|both]
const {chromium,webkit}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const which=process.argv[2]||'both',root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const USER_B='bbbbbbbb-0000-4000-8000-0000000000b1';
const syntheticMic=()=>{const fake=async()=>{const c=new (window.AudioContext||window.webkitAudioContext)();(window.__ctxs=window.__ctxs||[]).push(c);c.resume().catch(()=>{});const o=c.createOscillator(),d=c.createMediaStreamDestination();o.connect(d);o.start();return d.stream};try{Object.defineProperty(MediaDevices.prototype,'getUserMedia',{value:fake,configurable:true,writable:true})}catch{}};
async function newPage(browser,kind,port){
  const page=await browser.newPage(kind==='webkit'?{viewport:{width:1280,height:900}}:{viewport:{width:1280,height:900},permissions:['microphone']});page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  if(kind==='webkit')await page.addInitScript(syntheticMic);
  (async()=>{while(!page.isClosed()){await page.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
  await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&document.getElementById('nfStart'));
  if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
  return{page,errors};
}
const type=(page,key,text)=>page.locator('.field[data-key="'+key+'"] textarea').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}))},text);
async function consultation(page,mark){   // record -> structure -> review, with the marker typed by the physician
  if(!(await page.locator('#consent').isChecked()))await page.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.locator('#nfStart').click();await page.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));
  await type(page,'sinais_vitais','PA 120x80 '+mark);await sleep(1300);await page.locator('#nfFinish').click();
  await page.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/pront[oa] para transcrever/i.test(document.getElementById('status')?.textContent||''));
  await page.locator('#nfProcess').click();
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
  const id=await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());
  await page.waitForFunction(([id,m])=>window.__qa.consultationRows.some(r=>String(r.encounter_id)===id&&JSON.stringify(r.fields).includes(m)),[id,mark],{timeout:30000});
  await page.waitForFunction(()=>!!window.__nexaAuditAuto&&!!window.__nexaAuditAuto.original);   // legacy audit state armed (captureOriginal ran)
  return id;
}
const reset=async page=>{   // main refuses "Novo atendimento" while data-recording-state is stale (<=1 s after structuring); like a physician, retry the click
  for(let t=0;t<30;t++){await page.locator('#resetBtn').evaluate(el=>el.click());if(await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value,null,{timeout:700}).then(()=>true,()=>false))return}
  throw new Error('reset never accepted')};
const rowBody=(page,id)=>page.evaluate(id=>{const r=window.__qa.consultationRows.find(x=>String(x.encounter_id)===id);return r?JSON.stringify(r.fields)+JSON.stringify(r.processing_meta||{}):null},id);
const finalFields=(page,id)=>page.evaluate(id=>{const r=window.__qa.consultationRows.find(x=>String(x.encounter_id)===id);return JSON.stringify(r&&r.processing_meta&&r.processing_meta.audit_capture?r.processing_meta.audit_capture.final_fields||{}:{})},id);
const writesTo=(page,id)=>page.evaluate(id=>(window.__qa.historyWrites||[]).filter(w=>String(w.filters.id)===id).map(w=>w.body),id);   // every UPDATE the client sent for that row, as captured on the wire
async function scenario(browser,kind,port,name,fn){if(process.env.ONLY&&!name.startsWith(process.env.ONLY))return;const {page,errors}=await newPage(browser,kind,port);try{await fn(page);const real=errors.filter(e=>!/ResizeObserver|Non-Error promise rejection/.test(e));assert.deepEqual(real,[],name+': page errors');console.log(kind+' '+name+': PASS')}finally{await page.close()}}
async function run(kind,port){
  const browser=await (kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true}:{headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try{
    await scenario(browser,kind,port,'S1 debounced persist armed, then reset and a NEW consultation is typed',async page=>{
      const A='MARK-A1-4711',B='MARK-B1-9042',id1=await consultation(page,A);
      await type(page,'exame_fisico','Exame '+A+' editado');                 // arms the 1.8 s debounce of the legacy writer
      await reset(page);
      for(let i=0;i<8;i++){await type(page,'sinais_vitais','PA 110x70 '+B+' '+i);await type(page,'queixa_principal','Queixa '+B);await sleep(450)}   // 3.6 s of typing in the NEW consultation
      await sleep(2500);
      const body=await rowBody(page,id1);assert.ok(body.includes(A),'consultation 1 keeps its own data');assert.ok(!body.includes(B),'S1: consultation 1 row must NOT contain consultation 2 data');
      const w1=await writesTo(page,id1);assert.ok(!w1.some(b=>b.includes(B)),'S1: no UPDATE sent for consultation 1 carries consultation 2 data ('+w1.length+' writes seen)');
    });
    await scenario(browser,kind,port,'S2 write already IN FLIGHT on a slow network while the physician moves on',async page=>{
      const A='MARK-A2-1203',B='MARK-B2-7788',id1=await consultation(page,A);
      await page.evaluate(()=>{window.__qa.historyDelayMs=1600});
      await type(page,'exame_fisico','Exame '+A+' lento');await sleep(1950);   // debounce fired: request is now in flight (its payload is already fixed)
      await reset(page);await type(page,'sinais_vitais','PA 100x60 '+B);await sleep(3200);
      const body=await rowBody(page,id1);assert.ok(!body.includes(B),'S2: in-flight write must not carry consultation 2 data');
      const w2=await writesTo(page,id1);assert.ok(w2.some(b=>b.includes('audit_capture')&&b.includes(A)),'S2: the in-flight write was actually sent with consultation 1 data ('+w2.length+' writes)');assert.ok(!w2.some(b=>b.includes(B)),'S2: no UPDATE for consultation 1 carries consultation 2 data');
    });
    await scenario(browser,kind,port,'S3 physician switch while a legacy write is armed',async page=>{
      const A='MARK-A3-5521',B='MARK-B3-3390',id1=await consultation(page,A);
      await type(page,'exame_fisico','Exame '+A+' antes da troca');
      await page.evaluate(id=>window.__qa.switchUser(id),USER_B);await page.waitForFunction(id=>window.currentProf.id===id,USER_B);
      await type(page,'sinais_vitais','PA 90x60 '+B);await type(page,'hda','HDA '+B);await sleep(3600);
      const rows=await page.evaluate(()=>window.__qa.consultationRows.map(r=>({enc:String(r.encounter_id),user:r.user_id,body:JSON.stringify(r.fields)+JSON.stringify(r.processing_meta||{})})));
      const a=rows.find(r=>r.enc===id1);assert.ok(a&&a.body.includes(A)&&!a.body.includes(B),'S3: physician A row has only A data');
      rows.filter(r=>r.user===USER_B).forEach(r=>assert.ok(!r.body.includes(A),'S3: physician B rows must not contain A data'));
    });
    await scenario(browser,kind,port,'S4 reset hand-off (audit outbox owns the click) never leaks the next consultation into the closed one',async page=>{
      const A='MARK-A4-8014',B='MARK-B4-2260',id1=await consultation(page,A);
      await type(page,'exame_fisico','Exame final '+A);await sleep(300);
      await reset(page);await type(page,'sinais_vitais','PA 105x65 '+B);await type(page,'queixa_principal','Queixa '+B);await sleep(3200);
      const w4=await writesTo(page,id1);assert.ok(w4.length>0,'S4: writes for consultation 1 were observed');assert.ok(!w4.some(b=>b.includes(B)),'S4: no UPDATE for consultation 1 carries consultation 2 data');
      assert.ok(!(await rowBody(page,id1)).includes(B),'S4: stored row of consultation 1 has no consultation 2 data');
    });
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html')body=require('./helpers/pilot.cjs').apply(body.toString()).replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{if(which!=='webkit')await run('chromium',server.address().port);if(which!=='chromium')await run('webkit',server.address().port);console.log('CROSS_CONSULTATION_GUARD_PASS')}
  catch(e){console.error('CROSS_CONSULTATION_GUARD_FAIL',e&&e.message||e,String(e&&e.stack).split('\n').filter(l=>/guard\.e2e/.test(l)).join(' | '));process.exit(1)}finally{server.close()}
})();
