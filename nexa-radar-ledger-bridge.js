/* Candidate bridge. Caller must supply an unlocked protected outbox and real Auth client. */
(function(root){
  'use strict';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function create({ledger=root.NexaRadarLedgerClient,outbox,client,radar,userId,organizationId,
    currentEncounterId,onStatus=()=>{}}={}){
    if(typeof ledger?.bindConfirmed!=='function'||typeof outbox?.enqueue!=='function'||
       typeof outbox?.drain!=='function'||typeof currentEncounterId!=='function'||
       typeof client?.auth?.getUser!=='function'||!uuid.test(userId||'')||
       !uuid.test(organizationId||''))throw new Error('RADAR_LEDGER_BRIDGE_UNAVAILABLE');
    let generation=0;
    const status=(state,pending=null)=>onStatus({state,pending});
    async function captureEvent(event,encounterId,ownerId){
      if(ownerId!==userId||!uuid.test(encounterId||'')||
         currentEncounterId()!==encounterId)throw new Error('RADAR_LEDGER_ENCOUNTER_UNBOUND');
      const result=await outbox.enqueue({owner_user_id:userId,organization_id:organizationId,
        encounter_id:encounterId,event});
      status('pending');
      return result;
    }
    async function onAutosaveSynced({encounter_id}={}){
      const epoch=++generation;
      if(!uuid.test(encounter_id||'')||currentEncounterId()!==encounter_id)
        throw new Error('RADAR_LEDGER_ENCOUNTER_UNBOUND');
      let binding;
      try{binding=await ledger.bindConfirmed(client,{activeEncounterId:encounter_id,
        userId,organizationId})}
      catch{status('blocked');return {complete:false,reason:'binding_unverified'}}
      if(epoch!==generation||currentEncounterId()!==encounter_id)
        return {complete:false,reason:'superseded'};
      let result;
      try{result=await outbox.drain(client,binding)}
      catch{status('blocked');return {complete:false,reason:'drain_failed'}}
      if(epoch!==generation||currentEncounterId()!==encounter_id)
        return {complete:false,reason:'superseded'};
      status(result.complete?'confirmed':'pending',result.pending);
      return result;
    }
    function invalidate(){generation++;status('unbound')}
    function attach(target=root){
      if(typeof target?.addEventListener!=='function'||typeof target?.removeEventListener!=='function')
        throw new Error('RADAR_LEDGER_EVENT_TARGET_REQUIRED');
      const started=event=>{
        const id=event?.detail?.encounter_id;
        if(!uuid.test(id||'')||currentEncounterId()!==id||radar?.bindEncounter?.(id)!==true)
          status('unbound');
      };
      const synced=event=>{void onAutosaveSynced(event?.detail).catch(()=>status('blocked'))};
      const reset=()=>invalidate();
      const conflict=()=>status('blocked');
      const listeners=[['nexa:encounter-started',started],['nexa:encounter-synced',synced],
        ['nexa:consultation-reset',reset],['nexa:encounter-sync-conflict',conflict]];
      for(const [name,handler] of listeners)target.addEventListener(name,handler);
      return ()=>{for(const [name,handler] of listeners)target.removeEventListener(name,handler)};
    }
    return {captureEvent,onAutosaveSynced,invalidate,attach};
  }
  const api={create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.NexaRadarLedgerBridge=api;
})(globalThis);
