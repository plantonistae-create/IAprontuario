/* V5.29 — LOCAL-VAULT PILOT GATE on the real page (EMULATED browsers; fixtures stand in for Supabase/AI). The vault is a ROLLOUT-gated feature keyed on the AUTHENTICATED identity (hash), not a security boundary.
 * Proves: shipped default (pilot OFF) = previous flow (no vault database, no badge/control/transcript panel, main status text, only CORS-allowed headers); pilot ON for the owner (badge, control, screen-lock notice, protected
 * recording, transcript panel); device kill switch (no deletion, existing audio still recoverable); config disabled AFTER recordings exist (recovery offer still works, new recordings use the previous flow); a
 * non-eligible physician on the same device (no pilot, no offer for another's audio); vault failure degrades to the previous flow with a warning. Usage: node tests/nexa-pilot-gate.e2e.cjs [chromium|webkit|both] */
const {chromium,webkit}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const P=require('./helpers/pilot.cjs');const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const tenSrc=fs.readFileSync(path.join(__dirname,'nexa-ten-visits.main.e2e.cjs'),'utf8');const syntheticMic=eval('('+tenSrc.match(/const syntheticMic=(\(\)=>\{[\s\S]*?\n)/)[1].replace(/;\s*$/,'')+')');
const which=process.argv[2]||'both',sleep=ms=>new Promise(r=>setTimeout(r,ms));
let CFG='off',USER='A';   // off = shipped default | on = enabled for A | disabled = hashes listed but enabled:false
async function run(kind,port){
  const browser=await (kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true}:{headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const ctx=await browser.newContext(kind==='webkit'?{viewport:{width:1280,height:900}}:{viewport:{width:1280,height:900},permissions:['microphone']});
  const open=async()=>{const p=await ctx.newPage();p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());if(kind==='webkit')await p.addInitScript(syntheticMic);
    await p.addInitScript(()=>{window.__hdr=[];const f=window.fetch;window.fetch=function(i,init){try{if(String(i).includes('/functions/v1/'))window.__hdr.push(Object.keys(Object.assign({},init&&init.headers)).map(k=>k.toLowerCase()))}catch{}return f.call(this,i,init)}});
    (async()=>{while(!p.isClosed()){await p.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
    await p.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&document.getElementById('nfStart'));await sleep(1200);return p};
  const record=async(p,secs=3)=>{if(await p.locator('#nexaNewCaseBtn').isVisible())await p.locator('#nexaNewCaseBtn').click();await p.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
    await p.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});await p.locator('#nfStart').click();await p.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));
    const during=await p.evaluate(()=>document.getElementById('status').textContent),page=await p.evaluate(()=>document.body.textContent);await sleep(secs*1000);await p.locator('#nfFinish').click();await p.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/pront[oa] para transcrever/i.test(document.getElementById('status')?.textContent||''),null,{timeout:30000});return{during,page,after:await p.evaluate(()=>document.getElementById('status').textContent)}};
  const process=async p=>{await p.locator('#nfProcess').click();await p.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));await sleep(800)};
  const vaultDb=p=>p.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name).filter(n=>/audio-checkpoint|nexa-audio/i.test(n)));
  const ALLOWED=['authorization','x-client-info','apikey','content-type'];
  try{
    // ---- 1. shipped default: pilot OFF = previous flow
    CFG='off';USER='A';let p=await open();
    assert.equal(await p.evaluate(()=>document.getElementById('nexaBackupBadge').hidden),true,kind+': badge hidden when pilot off');assert.equal(await p.evaluate(()=>!!document.getElementById('nexaVaultPilotControl')),false);
    let r=await record(p);assert.match(r.after,/áudio ainda apenas na memória/,kind+': previous status text: '+r.after);assert.ok(!/Mantenha a tela ligada/.test(r.during+r.after));
    await process(p);assert.equal(await p.evaluate(()=>!!document.getElementById('nexaTranscriptPanel')&&!document.getElementById('nexaTranscriptPanel').hidden),false,kind+': no transcript panel for non-pilot');
    assert.deepEqual(await vaultDb(p),[],kind+': pilot OFF never creates the vault database');assert.equal(await p.evaluate(()=>localStorage.getItem('nexa.vault.used')),null);assert.equal(await p.evaluate(()=>!!document.getElementById('nexaStorageRiskNotice')||!!document.getElementById('nexaAudioCheckpointRestoreBtn')),false);
    (await p.evaluate(()=>window.__hdr)).flat().forEach(h=>assert.ok(ALLOWED.includes(h),kind+': header '+h+' not allowed by hosted CORS'));await p.close();
    // ---- 2. pilot ON for the owner
    CFG='on';p=await open();
    assert.equal(await p.evaluate(()=>document.getElementById('nexaBackupBadge').hidden),false,kind+': badge visible when active');
    await p.waitForFunction(()=>/Piloto/.test(document.getElementById('nexaVaultPilotControl')?.innerText||''),null,{timeout:20000});
    let t=await p.evaluate(()=>document.getElementById('nexaVaultPilotControl')?.innerText||'');assert.match(t,/proteção local do áudio ATIVA/);assert.match(t,/mantenha a tela ligada e o NEXA aberto na frente/,kind+': approved screen-lock notice is shown');
    r=await record(p,12);assert.match(r.after,/Áudio protegido neste dispositivo/,r.after);await process(p);
    // (the transcript panel needs the server transcript, which is only requested when versioned capture is configured = remote flags ON; covered by nexa-transcript-capture.e2e.cjs)
    assert.ok((await vaultDb(p)).length>=1);assert.equal(await p.evaluate(()=>localStorage.getItem('nexa.vault.used')),'1');
    (await p.evaluate(()=>window.__hdr)).flat().forEach(h=>assert.ok(ALLOWED.includes(h),kind+': header '+h+' not allowed by hosted CORS (pilot on, flags off)'));
    const sessions=await p.evaluate(async()=>(await nexaAudioCheckpointP0.listOwned(currentProf.id)).length);assert.equal(sessions,1);
    // ---- 2b. device kill switch: nothing deleted, next recording uses the previous flow, control offers re-activation
    for(let i=0;i<30;i++){await p.locator('#resetBtn').evaluate(el=>el.click());if(await p.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value,null,{timeout:700}).then(()=>true,()=>false))break}
    await p.waitForFunction(()=>document.getElementById('nexaVaultPilotToggle')?.offsetParent!==null&&/Piloto/.test(document.getElementById('nexaVaultPilotControl').innerText));await p.locator('#nexaVaultPilotToggle').click();t=await p.evaluate(()=>document.getElementById('nexaVaultPilotControl').innerText);assert.match(t,/DESATIVADA neste aparelho/);assert.match(t,/nada foi apagado/);
    assert.equal(await p.evaluate(()=>document.getElementById('nexaBackupBadge').hidden),true);assert.equal(await p.evaluate(async()=>(await nexaAudioCheckpointP0.listOwned(currentProf.id)).length),1,kind+': kill switch deletes nothing');
    r=await record(p);assert.match(r.after,/áudio ainda apenas na memória/,kind+': killed device records with the previous flow');
    assert.equal(await p.evaluate(async()=>(await nexaAudioCheckpointP0.listOwned(currentProf.id)).length),1,kind+': no new vault session while killed');await p.close();
    // ---- 3. config disabled AFTER recordings exist (kill flag cleared): recovery offer still present and working; new recordings use the previous flow
    CFG='disabled';p=await open();await p.evaluate(()=>localStorage.removeItem('nexa.vaultPilot.off'));p=await (async()=>{await p.close();return open()})();
    assert.equal(await p.evaluate(()=>document.getElementById('nexaBackupBadge').hidden),true);assert.equal(await p.evaluate(()=>!!document.getElementById('nexaVaultPilotControl')),false,kind+': no pilot control when config is disabled');
    await p.waitForFunction(()=>document.getElementById('nexaAudioCheckpointRestoreBtn'),null,{timeout:25000});
    assert.match(await p.evaluate(()=>document.getElementById('nexaAudioCheckpointRestoreBtn').textContent),/Recuperar áudio protegido/,kind+': existing protected audio stays recoverable after deactivation');
    await p.evaluate(()=>document.getElementById('nexaAudioCheckpointRestoreBtn').click());await p.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/recuperad/i.test(document.getElementById('status')?.textContent||''),null,{timeout:30000});await p.close();
    // ---- 4. a different (non-eligible) physician on the SAME device
    CFG='on';USER='B';p=await open();
    assert.equal(await p.evaluate(()=>document.getElementById('nexaBackupBadge').hidden),true,kind+': non-eligible physician: no badge');assert.equal(await p.evaluate(()=>!!document.getElementById('nexaVaultPilotControl')),false);
    await sleep(1500);assert.equal(await p.evaluate(()=>!!document.getElementById('nexaAudioCheckpointRestoreBtn')),false,kind+': never offered another physician\'s audio');
    r=await record(p);assert.match(r.after,/áudio ainda apenas na memória/,kind+': non-eligible physician keeps the previous flow');await p.close();
    // ---- 5. vault failure degrades to the previous flow (never blocks a clinical recording)
    CFG='on';USER='A';await ctx.clearCookies();p=await open();await p.evaluate(()=>localStorage.removeItem('nexa.vaultPilot.off'));
    await p.evaluate(()=>{const v=window.nexaAudioCheckpointP0;window.nexaAudioCheckpointP0=Object.freeze({...v,begin:async()=>{throw new Error('SYNTHETIC_VAULT_FAILURE')}})});
    r=await record(p);assert.match(r.after,/áudio ainda apenas na memória/,kind+': vault failure => previous flow');
    assert.match(r.page,/Proteção local do áudio indisponível/,kind+': the physician is told');await p.close();
    console.log('PASS',kind,'pilot gate');
  }finally{await ctx.close().catch(()=>{});await browser.close().catch(()=>{})}
}
(async()=>{const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{let body=fs.readFileSync(full);if(file==='/index.html'){let h=body.toString();const cfg=CFG==='on'?P.config([P.A]):CFG==='disabled'?P.config([P.A]).replace('enabled:true','enabled:false'):P.FROM;h=h.replace(P.FROM,cfg);
      let fx=fixture;if(USER==='B')fx=fx.split(P.A).join(P.B);body=h.replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fx+'</script>')}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',port);if(which!=='chromium')await run('webkit',port);console.log('PILOT_GATE_PASS (emulated; not iOS/Android evidence)')}catch(e){console.error('PILOT_GATE_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}})();
