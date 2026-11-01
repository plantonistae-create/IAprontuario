const {chromium}=require('playwright');
const {readFileSync}=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');

const manifestPath=process.argv[2];
if(!/^\/tmp\/nexa-pr93-transcript-[a-f0-9]+-[^/]+\/browser.json$/.test(manifestPath||''))throw Error('Disposable browser manifest required');
const m=JSON.parse(readFileSync(manifestPath,'utf8'));
if(!['localhost','127.0.0.1'].includes(new URL(m.api).hostname))throw Error('Loopback Supabase required');
const root=path.resolve(__dirname,'../..');
const original='Consulta sintética original: dor abdominal há três dias.';
const structuring='Entrada sintética usada na estruturação: dor abdominal há três dias.';
const corrected='Consulta sintética corrigida: dor abdominal há quatro dias.';
let phase='start';
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=pathname==='/'?'/index.html':pathname;
 const full=path.resolve(root,'.'+file);
 if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{
  let body=readFileSync(full);
  if(file==='/index.html'){
   let page=body.toString();
   page=page.replace("const SUPABASE_URL='https://fmkrcieubrlltiggyauc.supabase.co';",`const SUPABASE_URL='${m.api}';`)
    .replace(/const SUPABASE_ANON_KEY='[^']+';/,`const SUPABASE_ANON_KEY='${m.anon}';`)
    .replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.min.js','/node_modules/@supabase/supabase-js/dist/umd/supabase.js')
    .replace('async function processAudio(){','window.__localTranscriptPersist=(provenance,rec)=>nexaPersistAssistiveTranscript(provenance,rec,clinicalEpoch);\nasync function processAudio(){');
   body=Buffer.from(page);
  }
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);
 }catch{res.writeHead(404).end()}
});
async function login(page){
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e.stack||e.message||'').slice(0,350)));
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof document.querySelector('#authSubmitBtn')?.onclick==='function');
 await page.locator('#authEmail').fill(m.email);
 await page.locator('#authPassword').fill(m.password);
 await page.locator('#authRememberMe').check();
 await page.locator('#authSubmitBtn').click();
 try{await page.waitForFunction(()=>window.nexaClinicalRuntime18121?.getProfile()?.clinical_access===true,null,{timeout:12000})}
 catch(error){const state=await page.evaluate(()=>({banner:document.querySelector('#loginBanner')?.textContent?.slice(0,160),
  runtime:!!window.nexaClinicalRuntime18121,profile:window.nexaClinicalRuntime18121?.getProfile?.(),
  submitDisabled:document.querySelector('#authSubmitBtn')?.disabled,
  submitBound:typeof document.querySelector('#authSubmitBtn')?.onclick,
  loginVisible:document.querySelector('#loginGate')?.style.display,
  authResources:performance.getEntriesByType('resource').filter(x=>x.name.includes('/auth/v1/')).map(x=>new URL(x.name).pathname).slice(-5)}));throw Error(`Browser login incomplete: ${JSON.stringify(state)} errors=${JSON.stringify(pageErrors.slice(-8))}`)}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const a=await browser.newContext(),pageA=await a.newPage();
  phase='browser A login';
  await login(pageA);
  phase='browser A interrupted write';
  const provenance={schema_version:'nexa-transcript-v1',training_eligible:false,source_event_id:m.event,
   provider:'synthetic',transcriber_model:'local-browser-test',structuring_model:'local-browser-test',pipeline_version:'local-v1',
   original_final_text:original,structuring_input_text:structuring};
  const rec={encounter_id:m.encounter};
  await pageA.evaluate(owner=>{const autosave=window.nexaEncounterAutosave18101;
   autosave.flush=async()=>({sent:1});autosave.get=async()=>({sync_state:'synced',owner_user_id:owner});},m.owner);
  let interrupted=false;
  await pageA.route('**/rest/v1/encounter_transcript_versions*',async route=>{
   if(!interrupted&&route.request().method()==='POST'){interrupted=true;await route.abort('failed')}
   else await route.continue();
  });
  const failed=await pageA.evaluate(async ({provenance,rec})=>{
   try{await window.__localTranscriptPersist(provenance,rec);return null}catch(e){return e.message}
  },{provenance,rec});
  assert.equal(interrupted,true,'Transcript POST was not intercepted');
  assert.equal(failed,'TRANSCRIPT_REMOTE_WRITE_FAILED');
  await pageA.unrouteAll();
  phase='browser A interrupted ACK';
  let ackLost=0;
  await pageA.route('**/rest/v1/encounter_transcript_versions*',async route=>{
   if(route.request().method()==='GET'&&new URL(route.request().url()).searchParams.has('source_event_id')){ackLost++;await route.abort('failed')}
   else await route.continue();
  });
  const uncertain=await pageA.evaluate(async ({provenance,rec})=>{
   try{await window.__localTranscriptPersist(provenance,rec);return null}catch(e){return e.message}
  },{provenance,rec});
  assert.ok(ackLost>0,'Transcript verification GET was not intercepted');
  assert.equal(uncertain,'TRANSCRIPT_REMOTE_ACK_MISMATCH');
  await pageA.unrouteAll();
  phase='browser A verified retry';
  assert.equal(await pageA.evaluate(async ({provenance,rec})=>window.__localTranscriptPersist(provenance,rec),{provenance,rec}),true);
  const readback=await pageA.evaluate(async id=>{const {data,error}=await window.nexaClinicalSupabase18101.from('encounter_transcript_versions').select('transcript_kind,transcript_sha256,transcript_text').eq('consultation_id',id);if(error)throw error;return data},m.encounter);
  assert.equal(readback.length,2);
  await pageA.evaluate(()=>window.nexaClinicalSupabase18101.auth.signOut());
  await a.close();
  const b=await browser.newContext(),pageB=await b.newPage();
  phase='browser B login';
  await pageB.addInitScript(()=>{window.__initialBrowserStorage=[localStorage.length,sessionStorage.length]});
  await pageB.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await pageB.waitForFunction(()=>typeof document.querySelector('#authSubmitBtn')?.onclick==='function');
  assert.deepEqual(await b.cookies(),[]);
  assert.deepEqual(await pageB.evaluate(()=>window.__initialBrowserStorage),[0,0]);
  await pageB.locator('#authEmail').fill(m.email);
  await pageB.locator('#authPassword').fill(m.password);
  await pageB.locator('#authRememberMe').check();
  await pageB.locator('#authSubmitBtn').click();
  await pageB.waitForFunction(()=>window.nexaClinicalRuntime18121?.getProfile()?.clinical_access===true);
  phase='browser B History';
  await pageB.evaluate(()=>window.nexaOpenHistoryStage18122());
  const list=pageB.locator('#n197List');
  await pageB.locator('#n197Search').fill('Consulta sintética antiga');
  await list.getByRole('button',{name:'Carregar consultas anteriores'}).click();
  const row=list.locator('.n197-item').filter({hasText:'Consulta sintética antiga'});
  await row.getByRole('button',{name:'Transcrição integral'}).click();
  phase='browser B correction';
  let dialog=pageB.locator('.nexa-transcript-dialog');
  await dialog.waitFor();
  assert.ok((await dialog.textContent()).includes(original));
  assert.ok((await dialog.textContent()).includes(structuring));
  await dialog.getByRole('textbox',{name:'Nova versão corrigida'}).fill(corrected);
  await dialog.getByRole('button',{name:'Registrar correção'}).click();
  dialog=pageB.locator('.nexa-transcript-dialog');
  await pageB.waitForFunction(()=>document.querySelectorAll('.nexa-transcript-dialog pre').length===3,null,{timeout:12000});
  assert.equal(await dialog.locator('pre').count(),3);
  assert.ok((await dialog.textContent()).includes(original));
  assert.ok((await dialog.textContent()).includes(corrected));
  await pageB.reload({waitUntil:'domcontentloaded'});
  phase='browser B reload';
  await pageB.waitForFunction(()=>window.nexaClinicalRuntime18121?.getProfile()?.clinical_access===true);
  await pageB.evaluate(()=>window.nexaOpenHistoryStage18122());
  await pageB.locator('#n197Search').fill('Consulta sintética antiga');
  await list.getByRole('button',{name:'Carregar consultas anteriores'}).click();
  await row.getByRole('button',{name:'Transcrição integral'}).click();
  await pageB.locator('.nexa-transcript-dialog pre').first().waitFor();
  assert.equal(await pageB.locator('.nexa-transcript-dialog pre').count(),3);
  await b.close();
  console.log('TWO_BROWSER_CONTEXTS_TRANSCRIPT_PASS: local Auth, old History page, versioned recovery, interrupted ACK retry');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error('Phase',phase,error.name||'BrowserError',String(error.message||'').slice(0,1800));process.exitCode=1});
