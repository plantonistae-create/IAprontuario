/* V5.25 — multi-device recovery on the real page (EMULATED browsers; the Edge function is covered by handler tests, here the adapter is stubbed).
 * Device 1 records a visit (text synced to the server fixture). Device 2 = a NEW browser context (no local vault, no local records) signs in as the same physician, sees the remote-backup offer,
 * restores the consultation text AND the audio from the server, and the recovered bytes are what "Transcrever" sends. Another physician is never offered it. Usage: node tests/nexa-audio-multidevice.e2e.cjs [chromium|webkit|both] */
const {chromium,webkit}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const tenSrc=fs.readFileSync(path.join(__dirname,'nexa-ten-visits.main.e2e.cjs'),'utf8');const syntheticMic=eval('('+tenSrc.match(/const syntheticMic=(\(\)=>\{[\s\S]*?\n)/)[1].replace(/;\s*$/,'')+')');
const which=process.argv[2]||'both',sleep=ms=>new Promise(r=>setTimeout(r,ms)),MARK='SINT-MD-'+Date.now(),BYTES=[...Array(777)].map((_,i)=>(i*13)&255);
const stub=`window.nexaPreservationAdaptersV523={mode:'test-stub',listRemote:async()=>(window.currentProf?.id==='aaaaaaaa-0000-4000-8000-0000000000a1'?window.__remoteList:null)||[]   /* the real server lists ONLY the caller's own backups */,recoverRemote:async s=>{window.__recoverCalls=(window.__recoverCalls||0)+1;return{blob:new Blob([new Uint8Array(${JSON.stringify(BYTES)})],{type:'audio/webm'}),manifest:{digest:'d'}}},confirmRemote:async()=>false,start:()=>({started:false})};window.__remoteList=null;`;
async function run(kind,port){
  const browser=await (kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true}:{headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const newCtx=()=>browser.newContext(kind==='webkit'?{viewport:{width:1280,height:900}}:{viewport:{width:1440,height:1000},permissions:['microphone']});
  const page=async(ctx,init)=>{const p=await ctx.newPage();p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());if(kind==='webkit')await p.addInitScript(syntheticMic);if(init)await p.addInitScript(init);
    (async()=>{while(!p.isClosed()){await p.evaluate(()=>Promise.all((window.__ctxs||[]).map(c=>c.resume().catch(()=>{})))).catch(()=>{});await sleep(250)}})();
    await p.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&document.getElementById('nfStart'));return p};
  try{
    // ---- device 1: a real visit, text synced to the "server"
    const c1=await newCtx(),p1=await page(c1);if(await p1.locator('#nexaNewCaseBtn').isVisible())await p1.locator('#nexaNewCaseBtn').click();
    await p1.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!!window.nexaEncounterAutosave18101.currentEncounterId());
    const enc=await p1.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());
    await p1.locator('.field[data-key="hda"] textarea').evaluate((el,m)=>{el.value='HDA '+m;el.dispatchEvent(new Event('input',{bubbles:true}))},MARK);
    await p1.waitForFunction(([e,m])=>window.__qa.consultationRows.some(r=>String(r.encounter_id)===e&&JSON.stringify(r.fields).includes(m)),[enc,MARK],{timeout:30000});
    const row=await p1.evaluate(([e])=>window.__qa.consultationRows.find(r=>String(r.encounter_id)===e),[enc]);await c1.close();
    // ---- device 2: brand-new browser profile, same physician; the server lists one remote backup
    const c2=await newCtx();const remote=[{encounter_id:enc,session_id:'99999999-9999-4999-8999-999999999999',source_version:1,mime:'audio/webm',chunk_count:3,total_bytes:777,digest:'a'.repeat(64),committed_at:new Date().toISOString()}];
    const p3=await c2.newPage();p3.setDefaultTimeout(30000);p3.on('dialog',d=>d.accept());if(kind==='webkit')await p3.addInitScript(syntheticMic);await p3.addInitScript(stub+`window.__remoteList=${JSON.stringify(remote)};`);
    await p3.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});await p3.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&document.getElementById('nfStart'));
    assert.equal((await p3.evaluate(()=>window.nexaAudioCheckpointP0.listOwned(window.currentProf.id))).length,0,kind+': device 2 holds NO local audio');
    await p3.evaluate(([row])=>{window.__qa.consultationRows.push(row);window.__aud=null;const f=window.fetch;window.fetch=async(i,init)=>{if(String(i).includes('process-consultation')&&init&&init.body instanceof FormData){const a=init.body.get('audio');window.__aud=a?{size:a.size,bytes:Array.from(new Uint8Array(await a.arrayBuffer()).slice(0,8))}:'no-audio-field'}return f(i,init)}},[row]);
    await p3.waitForFunction(()=>!!document.getElementById('nexaRemoteAudioRestoreBtn'),null,{timeout:30000});assert.match(await p3.locator('#nexaRemoteAudioRestoreBtn').innerText(),/Recuperar áudio do servidor/);assert.ok(await p3.locator('#nexaRemoteAudioRestoreBtn').isVisible(),kind+': the offer is VISIBLE on the home screen');
    await p3.locator('#nexaRemoteAudioRestoreBtn').click();
    await p3.waitForFunction(()=>/Áudio recuperado do servidor/.test(document.getElementById('status')?.textContent||'')||!document.getElementById('processBtn').disabled,null,{timeout:30000});
    const st=await p3.evaluate(()=>({enc:window.nexaEncounterAutosave18101.currentEncounterId(),proc:!document.getElementById('processBtn').disabled,hda:document.querySelector('.field[data-key="hda"] textarea')?.value||'',recoverCalls:window.__recoverCalls}));
    assert.equal(st.enc,enc,kind+': the SERVER encounter was adopted on device 2');assert.ok(st.hda.includes(MARK),kind+': the consultation text came from the server');assert.ok(st.proc);assert.equal(st.recoverCalls,1);
    // the recovered bytes are the ones "Transcrever" sends
    await p3.locator('#processBtn').evaluate(el=>el.click());await p3.waitForFunction(()=>window.__aud!==null,null,{timeout:30000});const aud=await p3.evaluate(()=>window.__aud);
    assert.deepEqual([aud.size,aud.bytes],[BYTES.length,BYTES.slice(0,8)],kind+': the audio submitted for transcription is exactly the server-recovered audio');
    // another physician on the same profile is never offered it
    await p3.evaluate(()=>window.__qa.switchUser('bbbbbbbb-0000-4000-8000-0000000000b1'));await p3.waitForFunction(()=>window.currentProf?.id==='bbbbbbbb-0000-4000-8000-0000000000b1');await sleep(2500);
    assert.equal(await p3.evaluate(()=>{const b=document.getElementById('nexaRemoteAudioRestoreBtn');return !!b&&b.isConnected&&b.offsetParent!==null}),false,kind+': physician B is not offered A\'s remote backup');
    await c2.close();console.log('PASS',kind,'device 2 restores text + audio from the server; submitted bytes identical; B sees nothing');
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{
  const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{let body=fs.readFileSync(full);if(file==='/index.html')body=require('./helpers/pilot.cjs').apply(body.toString()).replace('remotePreservation:false','remotePreservation:true').replace('assistAuthority:false','assistAuthority:true').replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',port);if(which!=='chromium')await run('webkit',port);console.log('AUDIO_MULTIDEVICE_PASS (emulated; adapter stubbed)')}catch(e){console.error('AUDIO_MULTIDEVICE_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}
})();
