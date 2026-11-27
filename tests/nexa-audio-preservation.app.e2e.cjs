/* V5.23 — APP-LEVEL preservation of an interrupted recording on the real page (fixtures stand in for Supabase/AI only).
 * Scenario: record → the first durable chunk lands → the tab dies abruptly (no stop, no unload handler) → a new page of the same browser profile offers the protected audio,
 * the physician restores it, the encounter text comes back, and a DIFFERENT signed-in physician is never offered that audio.
 * EMULATED Chromium/WebKit with a synthetic microphone. This is not evidence for iOS Safari / Android Chrome devices. Usage: node tests/nexa-audio-preservation.app.e2e.cjs [chromium|webkit|both] */
const {chromium,webkit}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const tenSrc=fs.readFileSync(path.join(__dirname,'nexa-ten-visits.main.e2e.cjs'),'utf8');
const syntheticMic=eval('('+tenSrc.match(/const syntheticMic=(\(\)=>\{[\s\S]*?\n)/)[1].replace(/;\s*$/,'')+')');
const which=process.argv[2]||'both',MARK='SINT-CRASH-'+Date.now();
async function run(kind,port){
  const browser=await (kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true}:{headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const ctx=await browser.newContext(kind==='webkit'?{viewport:{width:1280,height:900}}:{viewport:{width:1440,height:1000},permissions:['microphone']});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const mk=async()=>{const p=await ctx.newPage();p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());if(kind==='webkit')await p.addInitScript(syntheticMic);
    (async()=>{while(!p.isClosed()){await p.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
    await p.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaAudioCheckpointP0&&document.getElementById('nfStart'));return p};
  try{
    const p1=await mk();
    if(await p1.locator('#nexaNewCaseBtn').isVisible())await p1.locator('#nexaNewCaseBtn').click();
    await p1.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
    await p1.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
    await p1.locator('#nfStart').click();await p1.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));
    await p1.locator('.field[data-key="hda"] textarea').evaluate((el,m)=>{el.value='HDA '+m;el.dispatchEvent(new Event('input',{bubbles:true}))},MARK);
    const enc=await p1.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId()),owner=await p1.evaluate(()=>window.currentProf.id);
    // wait until the first 10 s chunk is durable in the vault
    {const t0=Date.now();let n=0;   // (Playwright's waitForFunction does not await an async predicate, so poll explicitly)
     while(Date.now()-t0<45000&&n<1){n=await p1.evaluate(async([o])=>{const l=await window.nexaAudioCheckpointP0.listOwned(o);if(!l.length)return 0;try{return(await window.nexaAudioCheckpointP0.recover({ownerId:o,encounterId:l[0].encounterId,sessionId:l[0].sessionId})).chunks}catch{return 0}},[owner]);if(!n)await sleep(500)}
     assert.ok(n>=1,kind+': the first 10 s chunk must become durable before the crash')}
    await sleep(1500);   // let the autosave debounce store the text locally
    await p1.close({runBeforeUnload:false});   // abrupt: no stop, no finalize
    const p2=await mk();
    await p2.waitForFunction(()=>!!document.getElementById('nexaAudioCheckpointRestoreBtn'),null,{timeout:30000});
    assert.match(await p2.locator('#nexaAudioCheckpointRestoreBtn').innerText(),/Recuperar áudio protegido/);
    await p2.evaluate(()=>{window.__shows=[];new MutationObserver(ms=>{for(const m of ms){const t=(m.target.nodeType===3?m.target.parentElement:m.target)?.textContent||'';for(const n of [...m.addedNodes])window.__shows.push({m:String(n.textContent||'').slice(0,200),err:!!(n.className||'').toString().match(/err|bad|warn|danger/i)});window.__shows.push({m:t.slice(0,200),err:!!(m.target.className||'').toString().match(/err|bad|warn|danger/i)})}}).observe(document.body,{childList:true,subtree:true,characterData:true})});   // the toast is module-scoped, so the physician-facing message is observed in the DOM (other modules also rewrite #status on a timer)
    await p2.locator('#nexaAudioCheckpointRestoreBtn').click();
    await p2.waitForFunction(()=>window.__shows.some(x=>/Recuperação parcial|Gravação recuperada/.test(x.m)),null,{timeout:30000});const shown=await p2.evaluate(()=>window.__shows);
    const st=await p2.evaluate(()=>({enc:window.nexaEncounterAutosave18101.currentEncounterId(),proc:!document.getElementById('processBtn').disabled,hda:document.querySelector('.field[data-key="hda"] textarea')?.value||'',status:document.getElementById('status').textContent}));
    assert.equal(st.enc,enc,kind+': the restored audio is attached to ITS OWN encounter');assert.ok(st.proc,kind+': transcription can be started from the recovered audio');
    assert.ok(st.hda.includes(MARK),kind+': the interrupted consultation text is back ('+st.hda.slice(0,40)+')');assert.ok(shown.some(x=>/Recuperação parcial/.test(x.m)),kind+': an unfinalized recording is reported as PARTIAL (error-styled), never as complete: '+JSON.stringify(shown));assert.ok(!shown.some(x=>/Gravação recuperada neste dispositivo/.test(x.m)),kind+': never reported as a complete recording');
    // another physician on the same browser profile must not be offered A's audio
    await p2.evaluate(()=>window.__qa.switchUser('bbbbbbbb-0000-4000-8000-0000000000b1'));
    await p2.waitForFunction(()=>window.currentProf?.id==='bbbbbbbb-0000-4000-8000-0000000000b1');await sleep(1500);
    const stale=await p2.evaluate(()=>{const b=document.getElementById('nexaAudioCheckpointRestoreBtn');return !!b&&b.isConnected&&getComputedStyle(b).display!=='none'&&b.offsetParent!==null});
    assert.equal(stale,false,kind+': physician B must NOT see physician A\'s "recover protected audio" offer');
    const listB=await p2.evaluate(()=>window.nexaAudioCheckpointP0.listOwned('bbbbbbbb-0000-4000-8000-0000000000b1'));assert.equal(listB.length,0);
    console.log('PASS',kind,'abrupt tab death → restore offer → partial audio + text recovered → user switch shows nothing');
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html')body=require('./helpers/pilot.cjs').apply(body.toString()).replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',port);if(which!=='chromium')await run('webkit',port);console.log('AUDIO_PRESERVATION_APP_PASS (emulated; not iOS/Android device evidence)')}catch(e){console.error('AUDIO_PRESERVATION_APP_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}
})();
