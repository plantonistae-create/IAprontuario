/* Candidate-only encrypted Radar outbox. No key is created or persisted here. */
(function(root){
  'use strict';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const question=/^(?:conflict:)?[a-z][A-Za-z0-9_]{0,63}$/;
  const concept=/^[a-z][a-z0-9_]{0,63}$/;
  const allowed={type:['appeared','changed','removed','manual_answer','reopened'],
    status:['to_ask','asked','confirm','clarified','dismissed','not_applicable'],
    priority:['critical','high','moderate','low'],
    reason:['engine_recalculation','no_longer_suggested','patient_answer','clinician_answer',
      'manual_reopen','not_applicable','superseded','unresolved_conflict'],origin:['engine','ai','human']};
  const pick=(event)=>({event_id:event?.event_id,local_sequence:event?.sequence??event?.local_sequence,
    id:event?.id,concept:event?.concept,
    type:event?.type,previous_status:event?.previous_status??null,current_status:event?.current_status??null,
    previous_priority:event?.previous_priority??null,current_priority:event?.current_priority??null,
    reason_code:event?.reason_code,origin:event?.origin,engine_version:event?.engine_version,
    processing_id:event?.processing_id??null,evidence_ref_hash:event?.evidence_ref_hash??null,
    snapshot_version:event?.snapshot_version});
  const has=(set,value)=>value==null||set.includes(value);
  function canonical({owner_user_id,encounter_id,organization_id,event}={}){
    const e=pick(event);
    if(!uuid.test(owner_user_id||'')||!uuid.test(encounter_id||'')||!uuid.test(organization_id||'')||
       !uuid.test(e.event_id||'')||!Number.isSafeInteger(e.local_sequence)||e.local_sequence<1||
       !question.test(e.id||'')||!concept.test(e.concept||'')||
       !allowed.type.includes(e.type)||!has(allowed.status,e.previous_status)||
       !has(allowed.status,e.current_status)||!has(allowed.priority,e.previous_priority)||
       !has(allowed.priority,e.current_priority)||!allowed.reason.includes(e.reason_code)||
       !allowed.origin.includes(e.origin)||!/^[A-Za-z0-9._:-]{1,80}$/.test(e.engine_version||'')||
       (e.processing_id!==null&&!uuid.test(e.processing_id))||
       (e.evidence_ref_hash!==null&&!/^[0-9a-f]{64}$/.test(e.evidence_ref_hash))||
       !Number.isInteger(e.snapshot_version)||e.snapshot_version<1||e.snapshot_version>10000)
      throw new Error('RADAR_OUTBOX_EVENT_INVALID');
    return {owner_user_id,encounter_id,organization_id,event:e};
  }
  function indexedDbStore(){
    if(typeof indexedDB==='undefined')throw new Error('RADAR_OUTBOX_IDB_REQUIRED');
    const open=()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('nexa-radar-encrypted-outbox-v1',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('events'))
        request.result.createObjectStore('events',{keyPath:'id'})};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(new Error('RADAR_OUTBOX_STORAGE_FAILED'));
    });
    const run=async(mode,operation)=>{
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('events',mode),request=operation(tx.objectStore('events'));
        let result;
        request.onsuccess=()=>{result=request.result};
        request.onerror=()=>reject(request.error?.name==='ConstraintError'?
          new Error('RADAR_OUTBOX_DUPLICATE'):new Error('RADAR_OUTBOX_STORAGE_FAILED'));
        tx.oncomplete=()=>{db.close();resolve(result)};
        tx.onabort=()=>{db.close();reject(new Error('RADAR_OUTBOX_STORAGE_FAILED'))};
      });
    };
    return {get:id=>run('readonly',s=>s.get(id)),all:()=>run('readonly',s=>s.getAll()),
      add:item=>run('readwrite',s=>s.add(item)),remove:id=>run('readwrite',s=>s.delete(id))};
  }
  function create({key,keySlot,store=indexedDbStore(),ledger=root.NexaRadarLedgerClient}={}){
    if(!uuid.test(keySlot||'')||key?.algorithm?.name!=='AES-GCM'||key.extractable!==false||
       !key.usages?.includes('encrypt')||!key.usages?.includes('decrypt')||
       typeof store?.add!=='function'||typeof store?.get!=='function'||
       typeof store?.all!=='function'||typeof store?.remove!=='function'||
       typeof ledger?.append!=='function')throw new Error('RADAR_OUTBOX_PROTECTED_KEY_REQUIRED');
    const subtle=crypto.subtle,encoder=new TextEncoder(),decoder=new TextDecoder();
    async function seal(value){
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const ciphertext=await subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(value)));
      return {id:value.event.event_id,slot:keySlot,iv,ciphertext};
    }
    async function unseal(item){
      try{return canonical(JSON.parse(decoder.decode(await subtle.decrypt(
        {name:'AES-GCM',iv:item.iv},key,item.ciphertext))))}
      catch{throw new Error('RADAR_OUTBOX_DECRYPT_FAILED')}
    }
    async function enqueue(input){
      const value=canonical(input),sealed=await seal(value);
      try{await store.add(sealed)}catch(error){
        if(error?.message!=='RADAR_OUTBOX_DUPLICATE')throw error;
        const existing=await store.get(sealed.id);
        if(!existing||existing.slot!==keySlot||
           JSON.stringify(await unseal(existing))!==JSON.stringify(value))
          throw new Error('RADAR_OUTBOX_EVENT_ID_CONFLICT');
      }
      return {event_id:sealed.id,state:'pending'};
    }
    async function pending(binding){
      const items=await store.all(),matching=[];
      for(const item of items){if(item.slot!==keySlot)continue;const value=await unseal(item);
        if(value.owner_user_id===binding?.owner_user_id&&value.encounter_id===binding?.encounter_id&&
           value.organization_id===binding?.organization_id)matching.push(value)}
      return matching.sort((a,b)=>a.event.local_sequence-b.event.local_sequence||
        a.event.event_id.localeCompare(b.event.event_id));
    }
    async function drain(client,binding){
      // bindConfirmed must be called again after every Auth or autosave transition.
      const queue=await pending(binding);let acknowledged=0;
      for(const value of queue){
        try{await ledger.append(client,binding,value.event)}catch{
          return {acknowledged,pending:(await pending(binding)).length,complete:false}}
        await store.remove(value.event.event_id);acknowledged++;
      }
      const remaining=(await pending(binding)).length;
      return {acknowledged,pending:remaining,complete:remaining===0};
    }
    return {enqueue,pending,drain};
  }
  const api={create,indexedDbStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.NexaRadarEncryptedOutbox=api;
})(globalThis);
