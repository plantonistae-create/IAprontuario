/* Synthetic browser storage test. The key is supplied by the test, never saved by the app. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomBytes}=require('node:crypto');
const {chromium}=require('playwright');

test('ciphertext survives page close and 502 events recover after external key unlock',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext();
    const url=pathToFileURL(path.join(__dirname,'nexa-radar-encrypted-outbox.fixture.html')).href;
    const bytes=[...randomBytes(32)];
    const load=async page=>{
      await page.goto(url);
      await page.evaluate(async secret=>{
        const key=await crypto.subtle.importKey('raw',new Uint8Array(secret),
          {name:'AES-GCM'},false,['encrypt','decrypt']);
        window.syntheticOutbox=NexaRadarEncryptedOutbox.create({key});
      },bytes);
    };
    const first=await context.newPage();await load(first);
    await first.evaluate(async()=>{
      for(let i=1;i<=502;i++)await window.syntheticOutbox.enqueue({
        owner_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        encounter_id:'11111111-1111-4111-8111-111111111111',
        organization_id:'22222222-2222-4222-8222-222222222222',
        event:{event_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,
          sequence:i,id:'dyspnea',concept:'dyspnea',type:'appeared',
          current_status:'to_ask',current_priority:'high',reason_code:'engine_recalculation',
          origin:'engine',engine_version:'radar-temporal-v1',snapshot_version:1,
          transcript:'Synthetic text must be discarded by allowlist'}
      });
    });
    await first.close();
    const second=await context.newPage();await load(second);
    const result=await second.evaluate(async()=>{
      const binding=NexaRadarLedgerClient.bind({
        consultation:{id:'legacy-text',encounter_id:'11111111-1111-4111-8111-111111111111',
          organization_id:'22222222-2222-4222-8222-222222222222',
          user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',encounter_state:'draft'},
        activeEncounterId:'11111111-1111-4111-8111-111111111111',
        organizationId:'22222222-2222-4222-8222-222222222222',
        userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
      const pending=await window.syntheticOutbox.pending(binding);
      return {length:pending.length,first:pending[0].event.local_sequence,
        last:pending.at(-1).event.local_sequence,
        includesText:JSON.stringify(pending).includes('Synthetic text')};
    });
    assert.deepEqual(result,{length:502,first:1,last:502,includesText:false});
    await context.close();
  }finally{await browser.close()}
});
