const {chromium}=require('playwright');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');

const manifestPath=process.argv[2];
if(!/^\/tmp\/nexa-pr93-transcript-[a-f0-9]+-[^/]+\/browser.json$/.test(manifestPath||''))throw Error('Disposable browser manifest required');
const m=JSON.parse(readFileSync(manifestPath,'utf8'));
if(!['localhost','127.0.0.1'].includes(new URL(m.api).hostname))throw Error('Loopback Supabase required');
const expiredClaims=JSON.parse(Buffer.from(m.expiredJwt.split('.')[1],'base64url').toString());
assert.ok(expiredClaims.exp+30<Math.floor(Date.now()/1000),'A naturally expired local Auth JWT is required');
const root=path.resolve(__dirname,'../..');
const original='Consulta sintética original: dor abdominal há três dias.';
const structuring='Entrada sintética usada na estruturação: dor abdominal há três dias.';
const corrected='Consulta sintética corrigida: dor abdominal há quatro dias.';
const crashDraft='Correção sintética após fechamento inesperado: dor abdominal há cinco dias.';
const keySlot=randomUUID();
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
   page=page.replace('</head>','<script src="/nexa-transcript-encrypted-draft.js"></script><script src="/nexa-transcript-draft-bridge.js"></script></head>');
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
 let browser,persistent;
 const draftProfile=mkdtempSync(path.join(path.dirname(manifestPath),'draft-profile-'));
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
  phase='browser A naturally expired JWT during write';
  let rejectedPost=0;
  await pageA.route('**/rest/v1/encounter_transcript_versions*',async route=>{
   if(route.request().method()==='POST'){
    rejectedPost++;
    await route.continue({headers:{...route.request().headers(),authorization:`Bearer ${m.expiredJwt}`}});
   }else await route.continue();
  });
  const expiredWrite=pageA.waitForResponse(response=>response.url().includes('/rest/v1/encounter_transcript_versions')&&
   response.request().method()==='POST');
  const authRejected=await pageA.evaluate(async ({provenance,rec})=>{
   try{await window.__localTranscriptPersist(provenance,rec);return null}catch(e){return e.message}
  },{provenance,rec});
  assert.equal(rejectedPost,1,'Transcript write did not use the expired Auth token');
  assert.equal((await expiredWrite).status(),401,'PostgREST must reject the naturally expired JWT');
  assert.equal(authRejected,'TRANSCRIPT_REMOTE_WRITE_FAILED');
  await pageA.unrouteAll();
  const renewed=await pageA.evaluate(async()=>{
   const {data,error}=await window.nexaClinicalSupabase18101.auth.refreshSession();
   return !error&&!!data?.session?.access_token;
  });
  assert.equal(renewed,true,'Real local Auth did not renew the synthetic session');
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
  const c=await browser.newContext(),pageC=await c.newPage();
  phase='browser C concurrent correction';
  await login(pageC);
  await pageC.evaluate(async id=>{
    const {data,error}=await window.nexaClinicalSupabase18101.from('consultation_history')
      .select('id,encounter_id,organization_id,consent_recorded_at').eq('id',id).maybeSingle();
    if(error||!data)throw new Error('Synthetic consultation unavailable to browser C');
    await window.nexaOpenTranscriptVersions(data);
  },m.encounter);
  const dialogC=pageC.locator('.nexa-transcript-dialog');
  await dialogC.waitFor();
  assert.equal(await dialogC.locator('pre').count(),2);
  await dialog.getByRole('textbox',{name:'Nova versão corrigida'}).fill(corrected);
  await dialog.getByRole('button',{name:'Registrar correção'}).click();
  dialog=pageB.locator('.nexa-transcript-dialog');
  await pageB.waitForFunction(()=>document.querySelectorAll('.nexa-transcript-dialog pre').length===3,null,{timeout:12000});
  assert.equal(await dialog.locator('pre').count(),3);
  assert.ok((await dialog.textContent()).includes(original));
  assert.ok((await dialog.textContent()).includes(corrected));
  await dialogC.getByRole('textbox',{name:'Nova versão corrigida'}).fill('Correção concorrente sintética, não publicada.');
  await dialogC.getByRole('button',{name:'Registrar correção'}).click();
  await dialogC.getByRole('alert').waitFor();
  assert.match(await dialogC.getByRole('alert').textContent(),/Correção não confirmada pelo servidor/);
  assert.equal(await dialogC.locator('pre').count(),2,'A stale editor must not claim the conflicting correction was saved');
  pageC.once('dialog',prompt=>prompt.dismiss());
  await dialogC.getByRole('button',{name:'Fechar'}).click();
  assert.equal(await dialogC.getByRole('textbox',{name:'Nova versão corrigida'}).inputValue(),
   'Correção concorrente sintética, não publicada.','Dismissed close must retain the unsaved correction');
  pageC.once('dialog',prompt=>prompt.accept());
  await dialogC.getByRole('button',{name:'Fechar'}).click();
  await pageC.evaluate(async id=>{
    const {data,error}=await window.nexaClinicalSupabase18101.from('consultation_history')
      .select('id,encounter_id,organization_id,consent_recorded_at').eq('id',id).maybeSingle();
    if(error||!data)throw new Error('Synthetic consultation unavailable on reload');
    await window.nexaOpenTranscriptVersions(data);
  },m.encounter);
  await pageC.waitForFunction(()=>document.querySelectorAll('.nexa-transcript-dialog pre').length===3);
  assert.ok((await pageC.locator('.nexa-transcript-dialog').textContent()).includes(corrected));
  await c.close();
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
  phase='browser D delayed write timeout';
  const d=await browser.newContext(),pageD=await d.newPage();
  await login(pageD);
  await pageD.evaluate(owner=>{const autosave=window.nexaEncounterAutosave18101;
   autosave.flush=async()=>({sent:1});autosave.get=async()=>({sync_state:'synced',owner_user_id:owner});},m.owner);
  const delayedEvent=randomUUID(),delayed={...provenance,source_event_id:delayedEvent};
  let delayedPost=0;
  await pageD.route('**/rest/v1/encounter_transcript_versions*',async route=>{
   if(route.request().method()!=='POST')return route.continue();
   delayedPost++;
   await new Promise(resolve=>setTimeout(resolve,16500));
   await route.continue().catch(()=>{}); // Client abort may close the route first.
  });
  const timeoutError=await pageD.evaluate(async ({provenance,rec})=>{
   try{await window.__localTranscriptPersist(provenance,rec);return null}catch(e){return e.message}
  },{provenance:delayed,rec});
  assert.equal(delayedPost,1,'Delayed transcript POST was not intercepted');
  assert.equal(timeoutError,'TRANSCRIPT_REMOTE_ACK_MISMATCH');
  await pageD.unrouteAll({behavior:'wait'});
  const delayedRows=await pageD.evaluate(async event=>{
   const {data,error}=await window.nexaClinicalSupabase18101.from('encounter_transcript_versions')
    .select('id').eq('source_event_id',event);
   if(error)throw error;return data;
  },delayedEvent);
  assert.equal(delayedRows.length,0,'Timed-out write unexpectedly reached the database');
  await d.close();
  phase='browser E encrypted editor crash recovery';
  const bootstrap=({keySlot,wrong=false})=>{
    const seed=new Uint8Array(32);seed.fill(wrong?71:37);
    window.__NEXA_TRANSCRIPT_DRAFT_E2E__={enabled:true,keySlot,
      getKey:async()=>crypto.subtle.importKey('raw',seed,{name:'AES-GCM'},false,['encrypt','decrypt'])};
  };
  const openEditor=async page=>{
    await page.evaluate(async id=>{
      const {data,error}=await window.nexaClinicalSupabase18101.from('consultation_history')
        .select('id,encounter_id,organization_id,consent_recorded_at').eq('id',id).maybeSingle();
      if(error||!data)throw Error('Synthetic consultation unavailable');
      await window.nexaOpenTranscriptVersions(data);
    },m.encounter);
    await page.locator('.nexa-transcript-dialog textarea').waitFor();
    return page.locator('.nexa-transcript-dialog');
  };
  const loginPersistent=async page=>{
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    const restored=await page.waitForFunction(()=>window.nexaClinicalRuntime18121?.getProfile()?.clinical_access===true,
      null,{timeout:3000}).then(()=>true,()=>false);
    if(!restored){await page.locator('#authEmail').fill(m.email);
      await page.locator('#authPassword').fill(m.password);
      await page.locator('#authRememberMe').check();await page.locator('#authSubmitBtn').click();
      await page.waitForFunction(()=>window.nexaClinicalRuntime18121?.getProfile()?.clinical_access===true)}
  };
  persistent=await chromium.launchPersistentContext(draftProfile,{headless:true});
  await persistent.addInitScript(bootstrap,{keySlot});
  let draftPage=await persistent.newPage();await loginPersistent(draftPage);
  let draftDialog=await openEditor(draftPage);
  await draftDialog.getByRole('textbox',{name:'Nova versão corrigida'}).fill(crashDraft);
  await draftDialog.locator('[data-nexa-draft-state="local"]').waitFor();
  const preCrash=await draftPage.evaluate(async id=>{
    const {data,error}=await window.nexaClinicalSupabase18101.from('encounter_transcript_versions')
      .select('id').eq('consultation_id',id);
    if(error)throw error;return data.length;
  },m.encounter);
  assert.equal(preCrash,3,'Local draft must not claim a remote version');
  await persistent.close();
  persistent=await chromium.launchPersistentContext(draftProfile,{headless:true});
  await persistent.addInitScript(bootstrap,{keySlot});
  draftPage=await persistent.newPage();await loginPersistent(draftPage);
  draftDialog=await openEditor(draftPage);
  assert.equal(await draftDialog.getByRole('textbox',{name:'Nova versão corrigida'}).inputValue(),'');
  await draftDialog.getByRole('button',{name:'Recuperar rascunho cifrado'}).click();
  assert.equal(await draftDialog.getByRole('textbox',{name:'Nova versão corrigida'}).inputValue(),crashDraft);
  let missingAck=0;
  await draftPage.route('**/rest/v1/encounter_transcript_versions*',async route=>{
    const request=route.request();
    if(request.method()==='GET'&&new URL(request.url()).searchParams.has('source_event_id')){
      missingAck++;await route.abort('failed');
    }else await route.continue();
  });
  await draftDialog.getByRole('button',{name:'Registrar correção'}).click();
  try{await draftDialog.getByRole('alert').waitFor({timeout:20000})}
  catch{
    const state=await draftPage.evaluate(()=>({dialogs:document.querySelectorAll('.nexa-transcript-dialog').length,
      pre:document.querySelectorAll('.nexa-transcript-dialog pre').length,
      feedbackHidden:document.querySelector('.nexa-transcript-dialog [role="alert"]')?.hidden,
      draftState:document.querySelector('.nexa-transcript-dialog [data-nexa-draft-state]')?.getAttribute('data-nexa-draft-state')}));
    throw Error(`Lost ACK state: requests=${missingAck} ${JSON.stringify(state)}`);
  }
  assert.ok(missingAck>=1,'Server verification ACK must be lost');
  assert.equal(await draftDialog.locator('[data-nexa-draft-state]').getAttribute('data-nexa-draft-state'),'local');
  await draftPage.unrouteAll();
  await draftDialog.getByRole('button',{name:'Registrar correção'}).click();
  await draftPage.waitForFunction(()=>document.querySelectorAll('.nexa-transcript-dialog pre').length===4,null,{timeout:12000});
  assert.ok((await draftPage.locator('.nexa-transcript-dialog').textContent()).includes(original));
  await draftPage.locator('.nexa-transcript-dialog textarea').fill('Segundo rascunho sintético não enviado.');
  await draftPage.locator('.nexa-transcript-dialog [data-nexa-draft-state="local"]').waitFor();
  await persistent.close();
  phase='browser F wrong key preserves ciphertext';
  persistent=await chromium.launchPersistentContext(draftProfile,{headless:true});
  await persistent.addInitScript(bootstrap,{keySlot,wrong:true});
  draftPage=await persistent.newPage();await loginPersistent(draftPage);
  draftDialog=await openEditor(draftPage);
  await draftDialog.locator('[data-nexa-draft-state="blocked"]').waitFor();
  assert.equal(await draftDialog.getByRole('button',{name:'Recuperar rascunho cifrado'}).count(),0);
  await persistent.close();
  console.log('TWO_BROWSER_CONTEXTS_TRANSCRIPT_PASS: local Auth, old History page, naturally expired JWT write, session refresh, idempotent retry, delayed POST timeout');
  console.log('ENCRYPTED_EDITOR_CRASH_RECOVERY_PASS: explicit recovery after browser restart, lost ACK retry, server verification, original preserved');
 }finally{await persistent?.close().catch(()=>{});await browser?.close();
   rmSync(draftProfile,{recursive:true,force:true});server.closeAllConnections();
   await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error('Phase',phase,error.name||'BrowserError',String(error.message||'').slice(0,1800));process.exitCode=1});
