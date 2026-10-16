'use strict';
/* Browser-level verification of the real NEXA conflict UI with synthetic clinical text. */
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const id1='00000000-0000-4000-8000-000000000201';
const id2='00000000-0000-4000-8000-000000000202';
const user='11111111-1111-4111-8111-111111111111';
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(req.url.split('?')[0]);
 const full=path.resolve(root,'.'+file);
 if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{
  const content=fs.readFileSync(full);
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');
  res.end(content);
 }catch{res.writeHead(404).end()}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1080,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/tests/fixtures/nexa-conflict-browser.html',{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.nexaEncounterConflictReview18102&&!!window.nexaEncounterAutosave18101);
  await page.evaluate(({id,user})=>{
   const api=window.nexaEncounterAutosave18101;
   const local={encounter_id:id,owner_user_id:user,fields:{hda:'HDA da versão local',conduta:'Conduta local'},
     encounter_state:'draft',sync_state:'conflict',sync_version:3,local_revision:1,
     last_client_saved_at:new Date().toISOString(),protocol_usage:[],audit_priority:0,legacy_status:'draft'};
   window.__syntheticRemote.set(id,{id,user_id:user,encounter_id:id,fields:{hda:'HDA do servidor',conduta:'Conduta do servidor'},
     encounter_state:'draft',status:'draft',sync_version:3,protocol_usage:[],audit_priority:0,
     updated_at:new Date().toISOString()});
   api.setActiveId(id);
   return api.put(local).then(()=>window.nexaEncounterConflictReview18102.refresh());
  },{id:id1,user});
  await page.locator('#nexa-c-banner button').first().click();
  await page.getByRole('button',{name:'Mesclar manualmente'}).click();
  const cards=page.locator('.nexa-c-card');
  assert.equal(await cards.count(),2);
  await cards.nth(0).locator('input[value="local"]').check();
  await cards.nth(1).locator('input[value="server"]').check();
  await page.getByRole('button',{name:'Revisar resultado'}).click();
  assert.equal(await page.getByRole('button',{name:'Confirmar e salvar'}).isDisabled(),true);
  await page.locator('#nexa-c-overlay input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Confirmar e salvar'}).click();
  await page.getByText('Resolução confirmada',{exact:false}).waitFor();
  const result=await page.evaluate(id=>({
   row:window.__syntheticRemote.get(id),
   local:window.nexaEncounterAutosave18101.get(id)
  }),id1);
  assert.equal(result.row.fields.conduta,'Conduta local');
  assert.equal(result.row.fields.hda,'HDA do servidor');
  assert.equal((await result.local).sync_state,'synced');
  const count=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const req=indexedDB.open('nexa-encounter-conflict-archive-v1');
   req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{
     const db=req.result,tx=db.transaction('snapshots','readonly'),query=tx.objectStore('snapshots').getAll();
     query.onsuccess=()=>resolve(query.result.length);query.onerror=()=>reject(query.error);
     tx.oncomplete=()=>db.close();
   };
  }));
  assert.equal(count,1,'both copies must have been archived before resolution');
  await page.getByRole('button',{name:'Concluir'}).click();

  const second=await browser.newPage({viewport:{width:390,height:844}});
  second.on('pageerror',e=>errors.push(e.message));
  await second.goto(base+'/tests/fixtures/nexa-conflict-browser.html',{waitUntil:'load'});
  await second.waitForFunction(()=>!!window.nexaEncounterConflictReview18102);
  await second.evaluate(({id,user})=>{
   const local={encounter_id:id,owner_user_id:user,fields:{hda:'Local 2'},
     encounter_state:'draft',sync_state:'conflict',sync_version:5,local_revision:1,
     last_client_saved_at:new Date().toISOString(),protocol_usage:[],audit_priority:0,legacy_status:'draft'};
   window.__syntheticRemote.set(id,{id,user_id:user,encounter_id:id,fields:{hda:'Servidor 2'},encounter_state:'draft',
     status:'draft',sync_version:5,protocol_usage:[],audit_priority:0,updated_at:new Date().toISOString()});
   return window.nexaEncounterAutosave18101.put(local).then(()=>window.nexaEncounterConflictReview18102.refresh());
  },{id:id2,user});
  await second.locator('#nexa-c-banner button').first().click();
  await second.getByRole('button',{name:'Usar local',exact:true}).first().click();
  await second.locator('#nexa-c-overlay input[type="checkbox"]').check();
  await second.evaluate(id=>{window.__syntheticRemote.get(id).sync_version=6},id2);
  await second.getByRole('button',{name:'Confirmar e salvar'}).click();
  await second.getByText('O servidor foi atualizado novamente.',{exact:false}).waitFor();
  const outcome=await second.evaluate(async id=>({
   local:await window.nexaEncounterAutosave18101.get(id),remote:window.__syntheticRemote.get(id)
  }),id2);
  assert.equal(outcome.local.sync_state,'conflict');
  assert.equal(outcome.remote.fields.hda,'Servidor 2');
  assert.deepEqual(errors,[],'no uncaught browser errors expected');
  console.log('NEXA browser conflict UI: manual review, persisted archive, concurrent update rejection PASS');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
