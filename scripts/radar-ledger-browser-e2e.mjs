/** Real NEXA page + disposable Supabase Auth/PostgREST. No hosted endpoint is allowed. */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {join,extname,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=resolve(new URL('..',import.meta.url).pathname);
const organizationId='22222222-2222-4222-8222-222222222222';
const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css',
  '.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};

export async function runRadarLedgerBrowserE2E({apiUrl,anonKey,email,password,sql}){
  if(!['127.0.0.1','localhost','::1'].includes(new URL(apiUrl).hostname))
    throw new Error('RADAR_E2E_HOSTED_API_FORBIDDEN');
  const umd=readFileSync(join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'));
  const prodUrl="const SUPABASE_URL='https://fmkrcieubrlltiggyauc.supabase.co';";
  const prodKey=/const SUPABASE_ANON_KEY='[^']+';/;
  const server=createServer((request,response)=>{
    const name=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
    if(name==='/__supabase_local.js'){
      response.writeHead(200,{'Content-Type':'application/javascript'}).end(umd);return;
    }
    const file=name==='/'?'/index.html':name;
    const full=resolve(root,'.'+file);
    if(!full.startsWith(root+'/')){response.writeHead(403).end();return;}
    try{
      let body=readFileSync(full);
      if(file==='/index.html'){
        let html=body.toString();
        assert(html.includes(prodUrl),'Expected static Supabase URL was not found');
        html=html.replace(prodUrl,`const SUPABASE_URL=${JSON.stringify(apiUrl)};`)
          .replace(prodKey,`const SUPABASE_ANON_KEY=${JSON.stringify(anonKey)};`)
          .replace(/<script defer="" src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^\"]+"><\/script>/,
            '<script src="./__supabase_local.js"></script>');
        body=Buffer.from(html);
      }
      response.writeHead(200,{'Content-Type':contentType[extname(file)]||'application/octet-stream'}).end(body);
    }catch{response.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const appUrl=`http://127.0.0.1:${server.address().port}/`;
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const control=await browser.newContext({serviceWorkers:'block'});
    await control.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?
      route.continue():route.abort());
    const controlPage=await control.newPage();
    await controlPage.goto(appUrl,{waitUntil:'domcontentloaded'});
    assert.equal(await controlPage.evaluate(()=>Boolean(window.nexaRadarLedgerTestCandidate)),false,
      'The ledger test bridge must remain absent without the loopback flag');
    await control.close();
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      return url.hostname==='127.0.0.1'?route.continue():route.abort();
    });
    const keyBytes=[...randomBytes(32)],keySlot=randomUUID();
    await context.addInitScript(({bytes,slot,org})=>{
      window.__NEXA_RADAR_LEDGER_E2E__={enabled:true,unlock:async()=>({
        key:await crypto.subtle.importKey('raw',new Uint8Array(bytes),{name:'AES-GCM'},false,['encrypt','decrypt']),
        keySlot:slot,organizationId:org
      })};
    },{bytes:keyBytes,slot:keySlot,org:organizationId});
    const page=await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(appUrl,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.nexaRadarLedgerTestCandidate?.activate&&
      window.nexaEncounterAutosave18101&&window.nexaRadar);
    await page.locator('#authEmail').fill(email);
    await page.locator('#authPassword').fill(password);
    await page.locator('#authSubmitBtn').click();
    await page.waitForFunction(()=>window.nexaClinicalRuntime18121?.getProfile?.()?.clinical_access===true);
    await page.evaluate(()=>window.nexaRadarLedgerTestCandidate.activate());
    // Force an unsent real autosave: the application may save a new encounter immediately.
    await context.setOffline(true);
    const encounterId=await page.evaluate(async()=>{
      const rec=await window.nexaEncounterAutosave18101.startNew('synthetic_browser_e2e');
      return rec?.encounter_id;
    });
    assert.match(encounterId,/^[0-9a-f-]{36}$/);
    await page.waitForFunction(id=>window.nexaRadar?.snapshot?.().encounter===id,encounterId);
    const generated=await page.evaluate(()=>{
      const hda=document.querySelector('.field[data-key="hda"] textarea');
      if(!hda)throw new Error('RADAR_E2E_HDA_FIELD_MISSING');
      for(let i=0;i<300&&window.nexaRadar.snapshot().questionEventSequence<502;i++){
        hda.value=i%2?'Paciente com dispneia há dois dias.':'Paciente com dor abdominal há dois dias.';
        window.nexaRadar.recalculate();
      }
      return {sequence:window.nexaRadar.snapshot().questionEventSequence,
        visual:window.nexaRadar.snapshot().questionEvents.length};
    });
    assert(generated.sequence>=502,`Radar emitted only ${generated.sequence} synthetic events`);
    assert.equal(generated.visual,300);
    await page.waitForFunction(async({id,count})=>{
      const queue=await window.nexaRadarLedgerTestCandidate.pending(id);
      return queue.length===count;
    },{id:encounterId,count:generated.sequence},{timeout:90000});
    const beforeAck=await page.locator('#ngLedgerSyncStatus').innerText();
    assert.match(beforeAck,/aguardando confirmação do servidor/i);
    assert.match(beforeAck,/histórico visual parcial/i);
    assert.equal(sql(`SELECT count(*) FROM public.consultation_history WHERE encounter_id='${encounterId}'`),'0',
      'Radar must not send before a remote autosave');
    assert.equal(sql(`SELECT count(*) FROM public.nexa_radar_question_events WHERE encounter_id='${encounterId}'`),'0');
    const opaque=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('nexa-radar-encrypted-outbox-v1');
        r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      const items=await new Promise((resolve,reject)=>{const tx=db.transaction('events','readonly');
        const r=tx.objectStore('events').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      db.close();
      return items.every(item=>Object.keys(item).sort().join(',')==='ciphertext,id,iv,slot'&&
        item.ciphertext instanceof ArrayBuffer&&!JSON.stringify(item).includes('Paciente com'));
    });
    assert(opaque,'Outbox contains unexpected cleartext fields');
    await context.setOffline(false);
    const saved=await page.evaluate(()=>window.nexaEncounterAutosave18101.preserve('synthetic_radar_e2e'));
    assert.equal(saved?.encounter_id,encounterId);
    await page.waitForFunction(()=>window.nexaRadar?.state?.ledgerSyncStatus?.state==='confirmed',null,{timeout:180000});
    assert.match(await page.locator('#ngLedgerSyncStatus').innerText(),/fila temporal confirmada/i);
    assert.equal(sql(`SELECT count(*) FROM public.nexa_radar_question_events WHERE encounter_id='${encounterId}'`),String(generated.sequence));
    assert.equal(await page.evaluate(id=>window.nexaRadarLedgerTestCandidate.pending(id).then(x=>x.length),encounterId),0);
    const captureForFailure=sequence=>page.evaluate(({id,sequence})=>
      window.nexaRadarLedgerTestCandidate.captureEvent({event_id:crypto.randomUUID(),sequence,
        id:'dyspnea',concept:'dyspnea',type:'changed',previous_status:'to_ask',
        current_status:'asked',previous_priority:'high',current_priority:'high',
        reason_code:'patient_answer',origin:'engine',engine_version:'radar-temporal-v1',
        snapshot_version:1},id,window.nexaClinicalRuntime18121.getProfile().id),
      {id:encounterId,sequence});
    const rpcPattern='**/rest/v1/rpc/append_nexa_radar_question_event';
    await captureForFailure(generated.sequence+1);
    const offline=route=>route.abort();
    await page.route(rpcPattern,offline);
    const noSend=await page.evaluate(()=>window.nexaRadarLedgerTestCandidate.retry());
    assert.equal(noSend.complete,false);
    assert.equal(await page.evaluate(id=>window.nexaRadarLedgerTestCandidate.pending(id).then(x=>x.length),encounterId),1);
    assert.equal(sql(`SELECT count(*) FROM public.nexa_radar_question_events WHERE encounter_id='${encounterId}'`),String(generated.sequence));
    await page.unroute(rpcPattern,offline);
    assert.equal((await page.evaluate(()=>window.nexaRadarLedgerTestCandidate.retry())).complete,true);
    await captureForFailure(generated.sequence+2);
    const lostAck=async route=>{await route.fetch();await route.abort()};
    await page.route(rpcPattern,lostAck);
    const unconfirmed=await page.evaluate(()=>window.nexaRadarLedgerTestCandidate.retry());
    assert.equal(unconfirmed.complete,false);
    assert.equal(await page.evaluate(id=>window.nexaRadarLedgerTestCandidate.pending(id).then(x=>x.length),encounterId),1);
    assert.equal(sql(`SELECT count(*) FROM public.nexa_radar_question_events WHERE encounter_id='${encounterId}'`),String(generated.sequence+2));
    await page.unroute(rpcPattern,lostAck);
    assert.equal((await page.evaluate(()=>window.nexaRadarLedgerTestCandidate.retry())).complete,true);
    assert.equal(sql(`SELECT count(*) FROM public.nexa_radar_question_events WHERE encounter_id='${encounterId}'`),String(generated.sequence+2));
    await page.close();
    const reopened=await context.newPage();
    await reopened.goto(appUrl,{waitUntil:'domcontentloaded'});
    await reopened.waitForFunction(()=>window.nexaRadarLedgerTestCandidate?.activate&&window.nexaEncounterAutosave18101);
    if(await reopened.locator('#loginGate').isVisible()){
      await reopened.locator('#authEmail').fill(email);
      await reopened.locator('#authPassword').fill(password);
      await reopened.locator('#authSubmitBtn').click();
    }
    await reopened.waitForFunction(()=>window.nexaClinicalRuntime18121?.getProfile?.()?.clinical_access===true);
    await reopened.evaluate(id=>window.nexaEncounterAutosave18101.setActiveId(id),encounterId);
    await reopened.evaluate(()=>window.nexaRadarLedgerTestCandidate.activate());
    const recovered=await reopened.evaluate(()=>window.nexaRadarLedgerTestCandidate.recover());
    assert.equal(recovered.complete,true);
    const expectedTotal=generated.sequence+2;
    assert.equal(recovered.events.length,expectedTotal);
    assert.deepEqual(recovered.events.map(x=>x.sequence),Array.from({length:expectedTotal},(_,i)=>i+1));
    const keyFailure=await reopened.evaluate(async({id,sequence,slot})=>{
      const userId=window.nexaClinicalRuntime18121.getProfile().id;
      const provider=window.__NEXA_RADAR_LEDGER_E2E__;
      const goodUnlock=provider.unlock;
      await window.nexaRadarLedgerTestCandidate.captureEvent({event_id:crypto.randomUUID(),
        sequence,id:'dyspnea',concept:'dyspnea',type:'changed',
        previous_status:'to_ask',current_status:'asked',previous_priority:'high',
        current_priority:'high',reason_code:'patient_answer',origin:'engine',
        engine_version:'radar-temporal-v1',snapshot_version:1},id,userId);
      const before=(await window.nexaRadarLedgerTestCandidate.pending(id)).length;
      window.nexaRadarLedgerTestCandidate.close();
      provider.unlock=async()=>({key:await crypto.subtle.generateKey({name:'AES-GCM',length:256},
        false,['encrypt','decrypt']),keySlot:slot,
        organizationId:'22222222-2222-4222-8222-222222222222'});
      await window.nexaRadarLedgerTestCandidate.activate();
      const wrong=window.nexaRadar.state.ledgerSyncStatus.state;
      window.nexaRadarLedgerTestCandidate.close();
      provider.unlock=async()=>{throw new Error('SYNTHETIC_KEY_UNAVAILABLE')};
      let missing=false;
      try{await window.nexaRadarLedgerTestCandidate.activate()}catch{missing=true}
      const unavailable=window.nexaRadar.state.ledgerSyncStatus.state;
      provider.unlock=goodUnlock;
      await window.nexaRadarLedgerTestCandidate.activate();
      return {before,wrong,missing,unavailable};
    },{id:encounterId,sequence:expectedTotal+1,slot:keySlot});
    assert.deepEqual(keyFailure,{before:1,wrong:'blocked',missing:true,unavailable:'blocked'});
    await reopened.waitForFunction(()=>window.nexaRadar?.state?.ledgerSyncStatus?.state==='confirmed',null,{timeout:30000});
    assert.equal(sql(`SELECT count(*) FROM public.nexa_radar_question_events WHERE encounter_id='${encounterId}'`),String(expectedTotal+1));
    await context.close();
    console.log(`RADAR_LEDGER_BROWSER_PASS: ${generated.sequence} real UI events; Auth, autosave ACK, loss of network/ACK, encrypted outbox and reload recovery`);
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
