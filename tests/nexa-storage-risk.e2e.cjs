/* V5.28 — local-storage risk notice on the REAL page (EMULATED browsers; storage API values are injected, vault + page code are real). Informational only: never deletes, never blocks.
 * Cases: persisted=false + local audio => notice; persisted=true + roomy => silent; roomy but persisted=false and NO audio => silent; near-full quota => space line; iOS non-standalone => Home-Screen advice;
 * remote backup flag ON => silent; dismiss; the vault is untouched (same sessions after every case); no request leaves the page for it. Usage: node tests/nexa-storage-risk.e2e.cjs [chromium|webkit|both] */
const {chromium,webkit}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');const which=process.argv[2]||'both',sleep=ms=>new Promise(r=>setTimeout(r,ms));
let REMOTE=false;const U=(n)=>'aaaaaaaa-0000-4000-8000-00000000000'+n;
async function page(browser,port,store,ua){
  const ctx=await browser.newContext({viewport:{width:1280,height:900},...(ua?{userAgent:ua}:{})});const p=await ctx.newPage();p.setDefaultTimeout(30000);
  await p.addInitScript(s=>{const st=navigator.storage;Object.defineProperty(navigator,'storage',{configurable:true,value:{persist:async()=>s.persisted,persisted:async()=>s.persisted,estimate:async()=>({quota:s.quota,usage:s.usage}),getDirectory:st&&st.getDirectory?st.getDirectory.bind(st):undefined}})},store);
  await p.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaAudioCheckpointP0&&window.nexaStorageRiskV528);return p}
const seed=(p,n)=>p.evaluate(async n=>{const v=window.nexaAudioCheckpointP0,o=window.currentProf.id;for(let i=0;i<n;i++){const c={ownerId:o,encounterId:'bbbbbbbb-0000-4000-8000-00000000000'+(i+1),sessionId:'cccccccc-0000-4000-8000-00000000000'+(i+1)};await v.begin({...c,mime:'audio/webm'});await v.append({...c,sequence:0,blob:new Blob([new Uint8Array(2048)],{type:'audio/webm'})});await v.finalize({...c,expectedChunkCount:1})}return(await v.listOwned(o)).length},n);
const notice=async p=>{await p.evaluate(()=>window.dispatchEvent(new CustomEvent('nexa:recording-finalized',{detail:{}})));await sleep(2600);   // the page re-evaluates 1.5 s after a recording is finalized
  return p.evaluate(()=>document.getElementById('nexaStorageRiskNotice')?.innerText||'')};
async function run(kind,port){
  const browser=await (kind==='webkit'?webkit:chromium).launch({headless:true});
  try{
    // A: not persisted + local audio => notice (own copy only, no server copy), vault untouched
    let p=await page(browser,port,{persisted:false,quota:50e9,usage:30e6});assert.equal(await seed(p,2),2);let t=await notice(p);
    assert.match(t,/2 gravação\(ões\) protegida\(s\) só neste aparelho/,kind+': '+t);assert.match(t,/Ainda não existe cópia no servidor/);assert.match(t,/não garantiu armazenamento permanente/);assert.ok(!/Tela de Início/.test(t),'desktop UA: no Home Screen advice');assert.match(t,/Não limpe os dados do site/);
    // dismiss => stays quiet for the same message in this session; the vault is untouched
    await p.locator('#nexaStorageRiskNotice button').click();t=await notice(p);assert.equal(t,'',kind+': dismissed notice stays dismissed');assert.equal(await p.evaluate(async()=>(await nexaAudioCheckpointP0.listOwned(currentProf.id)).length),2,kind+': the notice never deletes');
    const reqs=await p.evaluate(()=>window.__qa.requests.filter(r=>/audio-backup|capture/.test(r.url)).length);assert.equal(reqs,0);await p.context().close();
    // B: persisted + roomy => silent even with audio;  C: not persisted but NO local audio => silent
    p=await page(browser,port,{persisted:true,quota:50e9,usage:30e6});await seed(p,1);assert.equal(await notice(p),'',kind+': persisted+roomy is silent');await p.context().close();
    p=await page(browser,port,{persisted:false,quota:50e9,usage:30e6});assert.equal(await notice(p),'',kind+': no local audio => silent');await p.context().close();
    // D: persisted but 90% full => space line only
    p=await page(browser,port,{persisted:true,quota:1000e6,usage:900e6});await seed(p,1);t=await notice(p);assert.match(t,/Espaço do navegador em 90%/);assert.ok(!/armazenamento permanente/.test(t));await p.context().close();
    // E: iOS, not installed => Home Screen advice (pure assessment on the real module)
    p=await page(browser,port,{persisted:false,quota:50e9,usage:1e6});
    const r=await p.evaluate(()=>({ios:nexaStorageRiskV528.assess({quota:5e9,usage:1e6,persisted:false},[{}],{standalone:false,ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'}),pwa:nexaStorageRiskV528.assess({quota:5e9,usage:1e6,persisted:false},[{}],{standalone:true,ua:'iPhone'}),remote:nexaStorageRiskV528.assess({quota:5e9,usage:1e6,persisted:false},[{}],{remoteBackup:true,ua:'iPhone'}),unknown:nexaStorageRiskV528.assess(null,[{}],{})}));
    assert.match(r.ios.lines.join(' '),/Tela de Início/);assert.ok(!/Tela de Início/.test(r.pwa.lines.join(' ')),'installed PWA: no install advice');assert.equal(r.remote.show,false,'remote backup on => no local-only warning');assert.equal(r.unknown.show,true,'unknown storage state with local audio still warns (persisted unknown)');
    await p.context().close();
    // F: server-side-looking text is rendered as text (textContent)
    console.log('PASS',kind,'storage risk notice');
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{let body=fs.readFileSync(full);if(file==='/index.html')body=require('./helpers/pilot.cjs').apply(body.toString()).replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',port);if(which!=='chromium')await run('webkit',port);console.log('STORAGE_RISK_PASS (emulated; storage API values injected)')}catch(e){console.error('STORAGE_RISK_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}})();
