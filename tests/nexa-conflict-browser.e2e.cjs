'use strict';
/* Browser-level verification of the real NEXA conflict UI with synthetic clinical text. */
const {chromium,firefox}=require('playwright');
const selectedBrowser=process.env.NEXA_BROWSER==='firefox'?'firefox':'chromium';
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
  browser=await (selectedBrowser==='firefox'?firefox:chromium).launch({headless:true});
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
  // Human-scale pause: previously the global document change observer treated
  // modal radio selection as a clinical edit, changing the local revision.
  await page.waitForTimeout(650);
  assert.equal((await page.evaluate(id=>window.nexaEncounterAutosave18101.get(id),id1)).local_revision,1,
    'selecting merge options must not autosave an unrelated clinical form');
  await page.getByRole('button',{name:'Revisar resultado'}).click();
  assert.equal(await page.getByRole('button',{name:'Confirmar e salvar'}).isDisabled(),true);
  await page.locator('#nexa-c-overlay input[type="checkbox"]').check();
  await page.waitForTimeout(650);
  assert.equal((await page.evaluate(id=>window.nexaEncounterAutosave18101.get(id),id1)).local_revision,1,
    'confirmation checkbox must not alter the clinical draft while reviewing');
  await page.getByRole('button',{name:'Confirmar e salvar'}).click();
  await page.getByText('Resolução confirmada',{exact:false}).waitFor();
  const result=await page.evaluate(async id=>({
   row:window.__syntheticRemote.get(id),
   local:await window.nexaEncounterAutosave18101.get(id)
  }),id1);
  assert.equal(result.row.fields.conduta,'Conduta local');
  assert.equal(result.row.fields.hda,'HDA do servidor');
  assert.equal(result.local.sync_state,'synced');
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
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!!window.nexaEncounterAutosave18101);
  const afterReload=await page.evaluate(id=>window.nexaEncounterAutosave18101.get(id),id1);
  assert.equal(afterReload.sync_state,'synced','Reload must not recreate a resolved merge conflict');
  assert.equal(afterReload.fields.hda,'HDA do servidor','Reload must not substitute stale visible form for reviewed clinical content');

  // Verify every real decision path with human-paced interactions:
  // Keep server, use local, and manually edit merged content.
  for(const config of [
    {id:'00000000-0000-4000-8000-000000000203',mode:'server',
     local:'LOCAL_TO_ARCHIVE',remote:'SERVER_TO_KEEP',expected:'SERVER_TO_KEEP'},
    {id:'00000000-0000-4000-8000-000000000204',mode:'local',
     local:'LOCAL_TO_KEEP',remote:'SERVER_TO_REPLACE',expected:'LOCAL_TO_KEEP'},
    {id:'00000000-0000-4000-8000-000000000205',mode:'manual',
     local:'LOCAL_FOR_EDIT',remote:'SERVER_FOR_EDIT',expected:'RECONCILED_BY_DOCTOR'}
  ]){
    await page.evaluate(({config,user})=>{
      const r={encounter_id:config.id,owner_user_id:user,fields:{hda:config.local},
        encounter_state:'draft',sync_state:'conflict',sync_version:4,local_revision:1,
        last_client_saved_at:new Date().toISOString(),protocol_usage:[],audit_priority:0,legacy_status:'draft'};
      window.__syntheticRemote.set(config.id,{
        id:config.id,user_id:user,encounter_id:config.id,fields:{hda:config.remote},
        encounter_state:'draft',status:'draft',sync_version:4,
        protocol_usage:[],audit_priority:0,updated_at:new Date().toISOString()
      });
      window.nexaEncounterAutosave18101.setActiveId(config.id);
      return window.nexaEncounterAutosave18101.put(r).then(()=>window.nexaEncounterConflictReview18102.refresh());
    },{config,user});
    await page.locator('#nexa-c-banner button').click();
    if(config.mode==='server')await page.getByRole('button',{name:'Manter servidor'}).click();
    if(config.mode==='local')await page.getByRole('button',{name:'Usar local',exact:true}).first().click();
    if(config.mode==='manual'){
      await page.getByRole('button',{name:'Mesclar manualmente'}).click();
      await page.locator('#nexa-c-overlay input[value="manual"]').check();
      await page.locator('#nexa-c-overlay textarea.nexa-c-edit').fill(config.expected);
      await page.waitForTimeout(650);
      await page.getByRole('button',{name:'Revisar resultado'}).click();
    }
    await page.locator('#nexa-c-overlay input[type="checkbox"]').check();
    // On real hardware, the user typically reads this consent. Previous code
    // incorrectly changed the clinical draft during this pause.
    await page.waitForTimeout(650);
    const unchanged=await page.evaluate(id=>window.nexaEncounterAutosave18101.get(id),config.id);
    assert.equal(unchanged.local_revision,1,'Resolution UI must not mutate the local clinical revision');
    assert.equal(unchanged.fields.hda,config.local,'Resolution UI must not replace the stored local content before confirmation');
    await page.getByRole('button',{name:'Confirmar e salvar'}).click();
    await page.getByText('Resolução confirmada',{exact:false}).waitFor();
    const values=await page.evaluate(async id=>({
      remote:window.__syntheticRemote.get(id),
      local:await window.nexaEncounterAutosave18101.get(id)
    }),config.id);
    assert.equal(values.remote.fields.hda,config.expected,'Server content must match reviewed '+config.mode+' decision');
    assert.equal(values.local.fields.hda,config.expected,'Local content must match the persisted server '+config.mode+' decision');
    assert.equal(values.local.sync_state,'synced','A successful '+config.mode+' decision must end the conflict');
    assert.equal(values.remote.sync_version,config.mode==='server'?4:5,'Only necessary writes may change server version');
    await page.getByRole('button',{name:'Concluir'}).click();
  }

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
  // The "Adiar" action must really dismiss the modal, preserve the conflicting
  // draft and keep only a small non-obstructive header shortcut.
  await second.getByRole('button',{name:'Adiar aviso (24h)'}).click();
  assert.equal(await second.locator('#nexa-c-overlay').isVisible(),false,'Adiar must close the dialog');
  assert.equal(await second.evaluate(()=>window.nexaEncounterConflictReview18102.isPostponed()),true);
  assert.equal(await second.evaluate(()=>getComputedStyle(document.getElementById('nexa-c-banner')).position),'static','conflict notice must not float above clinical inputs');
  assert.equal(await second.locator('#nexa-c-banner button').textContent(),'Pendências de sincronização (1)');
  assert.equal((await second.evaluate(id=>window.nexaEncounterAutosave18101.get(id),id2)).sync_state,'conflict','postponing cannot discard data');
  // Browser refresh must not re-enable the intrusive warning.
  await second.reload({waitUntil:'load'});
  await second.waitForFunction(()=>!!window.nexaEncounterConflictReview18102?.isPostponed?.()&&document.getElementById('nexa-c-banner')?.textContent?.includes('Pendências de sincronização'));
  assert.equal(await second.locator('#nexa-c-overlay').isVisible(),false);
  assert.equal((await second.evaluate(id=>window.nexaEncounterAutosave18101.get(id),id2)).sync_state,'conflict','persisted conflict survives reload');
  // Still available on demand from the unobtrusive navigation control.
  await second.evaluate(({id,user})=>{
    window.__syntheticRemote.set(id,{id,user_id:user,encounter_id:id,fields:{hda:'Servidor 2'},encounter_state:'draft',
      status:'draft',sync_version:6,protocol_usage:[],audit_priority:0,updated_at:new Date().toISOString()});
  },{id:id2,user});
  await second.locator('#nexa-c-banner button').click();
  await second.getByRole('button',{name:'Adiar aviso (24h)'}).waitFor();
  assert.equal(await second.locator('#nexa-c-overlay').isVisible(),true,'postponed conflict remains accessible for voluntary review');
  await second.getByRole('button',{name:'Adiar aviso (24h)'}).click();
  assert.equal(await second.locator('#nexa-c-overlay').isVisible(),false);
  assert.deepEqual(errors,[],'no uncaught browser errors expected');
  console.log('NEXA '+selectedBrowser+' conflict UI: server/local/manual merge, archive, CAS, defer, reload PASS');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
