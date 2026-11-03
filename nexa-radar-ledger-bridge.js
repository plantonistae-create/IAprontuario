/* Candidate bridge. Caller must supply an unlocked protected outbox and real Auth client. */
(function(root){
  'use strict';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function create({ledger=root.NexaRadarLedgerClient,outbox,client,userId,organizationId,
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
    return {captureEvent,onAutosaveSynced,invalidate};
  }
  const api={create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.NexaRadarLedgerBridge=api;
})(globalThis);
