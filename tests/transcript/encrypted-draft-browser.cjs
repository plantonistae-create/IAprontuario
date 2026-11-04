'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {chromium}=require('playwright');

(async()=>{
  const source=readFileSync(join(__dirname,'../../nexa-transcript-encrypted-draft.js'));
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.url==='/nexa-transcript-encrypted-draft.js'){
      res.setHeader('Content-Type','application/javascript');res.end(source);return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic draft</title>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const directory=mkdtempSync('/tmp/nexa-transcript-draft-browser-');
  const url=`http://127.0.0.1:${server.address().port}/`;
  const scope={owner_user_id:crypto.randomUUID(),organization_id:crypto.randomUUID(),
    encounter_id:crypto.randomUUID(),consultation_id:'synthetic-'+crypto.randomUUID()};
  const slot=crypto.randomUUID(),parent=crypto.randomUUID();
  // Fixed test-only seed; no production key is created or persisted by the module.
  const seed=Array.from({length:32},(_,i)=>i+11);
  const importKey=async page=>page.evaluate(async raw=>{
    window.__syntheticDraftKey=await crypto.subtle.importKey('raw',new Uint8Array(raw),
      {name:'AES-GCM'},false,['encrypt','decrypt']);
  },seed);
  let browser;
  try{
    browser=await chromium.launchPersistentContext(directory,{headless:true});
    let page=await browser.newPage();await page.goto(url);
    await page.addScriptTag({url:'/nexa-transcript-encrypted-draft.js'});await importKey(page);
    const saved=await page.evaluate(async ({scope,slot,parent})=>{
      const store=NexaTranscriptEncryptedDraft.create({key:window.__syntheticDraftKey,keySlot:slot});
      return store.save({binding:scope,parent_version_id:parent,text:'Rascunho sintético após queda.'});
    },{scope,slot,parent});
    assert.equal(saved.state,'stored_locally_unconfirmed');
    await browser.close();browser=null;
    browser=await chromium.launchPersistentContext(directory,{headless:true});
    page=await browser.newPage();await page.goto(url);
    await page.addScriptTag({url:'/nexa-transcript-encrypted-draft.js'});await importKey(page);
    const recovered=await page.evaluate(async ({scope,slot})=>{
      const store=NexaTranscriptEncryptedDraft.create({key:window.__syntheticDraftKey,keySlot:slot});
      const drafts=await store.list(scope);
      const foreign=await store.list({...scope,owner_user_id:crypto.randomUUID()});
      return {drafts,foreign};
    },{scope,slot});
    assert.equal(recovered.drafts.length,1);
    assert.equal(recovered.drafts[0].text,'Rascunho sintético após queda.');
    assert.equal(recovered.drafts[0].parent_version_id,parent);
    assert.deepEqual(recovered.foreign,[]);
    const wrongKey=await page.evaluate(async ({scope,slot})=>{
      const other=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      try{await NexaTranscriptEncryptedDraft.create({key:other,keySlot:slot}).list(scope);return 'unexpected'}
      catch(error){return error.message}
    },{scope,slot});
    assert.equal(wrongKey,'TRANSCRIPT_DRAFT_DECRYPT_FAILED');
    const ciphertext=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('nexa-transcript-encrypted-drafts-v1');
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
      const row=await new Promise((resolve,reject)=>{const req=db.transaction('drafts').objectStore('drafts').getAll();
        req.onsuccess=()=>resolve(req.result[0]);req.onerror=()=>reject(req.error)});db.close();
      return JSON.stringify(row);
    });
    assert.equal(ciphertext.includes('Rascunho sintético'),false);
    await page.evaluate(async ({scope,slot,id})=>{
      await NexaTranscriptEncryptedDraft.create({key:window.__syntheticDraftKey,keySlot:slot}).remove(scope,id);
    },{scope,slot,id:saved.draft_id});
    assert.equal(await page.evaluate(async ({scope,slot})=>(await NexaTranscriptEncryptedDraft
      .create({key:window.__syntheticDraftKey,keySlot:slot}).list(scope)).length,{scope,slot}),0);
    console.log('ENCRYPTED_DRAFT_BROWSER_PASS: restart, recovery, identity, wrong key, explicit deletion');
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
