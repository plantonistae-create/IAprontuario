/* Synthetic E2E adapter. This file is loaded only by index.html on 127.0.0.1 with an explicit test flag. */
(function(root){
  'use strict';
  if(root.location.hostname!=='127.0.0.1'||root.__NEXA_RADAR_LEDGER_E2E__?.enabled!==true)return;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let candidate=null,detach=null;
  const status=(state,pending=null)=>root.nexaRadar?.setLedgerSyncStatus?.({state,pending});
  async function activateUnlocked(){
    if(candidate)return candidate;
    const provider=root.__NEXA_RADAR_LEDGER_E2E__;
    const client=root.nexaClinicalRuntime18121?.client;
    const userId=root.nexaClinicalRuntime18121?.getProfile?.()?.id;
    const autosave=root.nexaEncounterAutosave18101;
    const radar=root.nexaRadar;
    if(!uuid.test(userId||'')||!client?.auth?.getUser||!autosave||!radar||
       typeof provider?.unlock!=='function')throw new Error('RADAR_LEDGER_TEST_NOT_READY');
    const auth=await client.auth.getUser();
    if(auth.error||auth.data?.user?.id!==userId)throw new Error('RADAR_LEDGER_TEST_AUTH_REQUIRED');
    // The E2E harness supplies a fresh synthetic key; production custody is intentionally absent.
    const unlocked=await provider.unlock(userId);
    if(!uuid.test(unlocked?.organizationId||'')||!uuid.test(unlocked?.keySlot||''))
      throw new Error('RADAR_LEDGER_TEST_KEY_UNAVAILABLE');
    const outbox=root.NexaRadarEncryptedOutbox.create({key:unlocked.key,keySlot:unlocked.keySlot});
    const bridge=root.NexaRadarLedgerBridge.create({
      outbox,client,radar,userId,organizationId:unlocked.organizationId,
      currentEncounterId:()=>autosave.currentEncounterId(),
      onStatus:next=>status(next.state,next.pending)
    });
    detach=bridge.attach(root);
    candidate={
      captureEvent:(...args)=>bridge.captureEvent(...args),
      pending:encounterId=>outbox.pending({owner_user_id:userId,
        organization_id:unlocked.organizationId,encounter_id:encounterId}),
      recover:async()=>{
        const id=autosave.currentEncounterId();
        const binding=await root.NexaRadarLedgerClient.bindConfirmed(client,{
          activeEncounterId:id,userId,organizationId:unlocked.organizationId});
        return root.NexaRadarLedgerClient.loadAll(client,binding);
      },
      retry:()=>bridge.onAutosaveSynced({encounter_id:autosave.currentEncounterId()}),
      close:()=>{detach?.();detach=null;bridge.invalidate();candidate=null;
        root.nexaRadarLedgerTestCandidate={activate}}
    };
    root.nexaRadarLedgerTestCandidate=candidate;
    const id=autosave.currentEncounterId();
    if(uuid.test(id||'')){
      if(!radar.bindEncounter(id))status('unbound');
      try{
        const queued=await candidate.pending(id);
        if(queued.length)status('pending',queued.length);
        const local=await autosave.get(id);
        if(local?.owner_user_id===userId&&local.sync_state==='synced')
          void candidate.retry().catch(()=>status('blocked'));
      }catch{status('blocked')}
    }
    return candidate;
  }
  async function activate(){
    try{return await activateUnlocked()}
    catch(error){status('blocked');throw error}
  }
  root.nexaRadarLedgerTestCandidate={activate};
})(globalThis);
