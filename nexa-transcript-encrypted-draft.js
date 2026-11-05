/* Candidate-only local correction drafts. The caller supplies and retains the key. */
(function(root){
  'use strict';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function validBinding(value){
    if(!uuid.test(value?.owner_user_id||'')||!uuid.test(value?.organization_id||'')||
       !uuid.test(value?.encounter_id||'')||
       typeof value?.consultation_id!=='string'||!value.consultation_id.trim()||
       value.consultation_id.length>160)throw new Error('TRANSCRIPT_DRAFT_BINDING_INVALID');
    return {owner_user_id:value.owner_user_id,organization_id:value.organization_id,
      encounter_id:value.encounter_id,consultation_id:value.consultation_id};
  }
  function indexedDbStore(){
    if(typeof indexedDB==='undefined')throw new Error('TRANSCRIPT_DRAFT_IDB_REQUIRED');
    const open=()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('nexa-transcript-encrypted-drafts-v1',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))
        request.result.createObjectStore('drafts',{keyPath:'id'})};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(new Error('TRANSCRIPT_DRAFT_STORAGE_FAILED'));
    });
    const run=async(mode,operation)=>{
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('drafts',mode),request=operation(tx.objectStore('drafts'));
        let result,failed=false;
        request.onsuccess=()=>{result=request.result};
        request.onerror=()=>{failed=true;reject(new Error('TRANSCRIPT_DRAFT_STORAGE_FAILED'))};
        tx.oncomplete=()=>{db.close();if(!failed)resolve(result)};
        tx.onabort=()=>{db.close();reject(new Error('TRANSCRIPT_DRAFT_STORAGE_FAILED'))};
      });
    };
    return {add:item=>run('readwrite',s=>s.add(item)),all:()=>run('readonly',s=>s.getAll()),
      remove:id=>run('readwrite',s=>s.delete(id))};
  }
  function create({key,keySlot,store=indexedDbStore()}={}){
    if(!uuid.test(keySlot||'')||key?.algorithm?.name!=='AES-GCM'||key.extractable!==false||
       !key.usages?.includes('encrypt')||!key.usages?.includes('decrypt')||
       typeof store?.add!=='function'||typeof store?.all!=='function'||
       typeof store?.remove!=='function')throw new Error('TRANSCRIPT_DRAFT_PROTECTED_KEY_REQUIRED');
    const encoder=new TextEncoder(),decoder=new TextDecoder();
    async function unseal(item){
      try{
        const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:item.iv,
          additionalData:encoder.encode(item.id)},key,item.ciphertext);
        const value=JSON.parse(decoder.decode(clear));
        if(value.id!==item.id||!uuid.test(value.id)||value.version!==1||
           typeof value.text!=='string'||!value.text.trim()||value.text.length>100000||
           !uuid.test(value.parent_version_id||'')||!Number.isFinite(value.saved_at))
          throw new Error('invalid');
        validBinding(value.binding);
        return value;
      }catch{throw new Error('TRANSCRIPT_DRAFT_DECRYPT_FAILED')}
    }
    async function save({binding,parent_version_id,text}={}){
      const canonical=validBinding(binding),content=String(text||'');
      if(!uuid.test(parent_version_id||'')||!content.trim()||content.length>100000)
        throw new Error('TRANSCRIPT_DRAFT_INVALID');
      const value={version:1,id:crypto.randomUUID(),binding:canonical,parent_version_id,
        text:content,saved_at:Date.now()};
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,
        additionalData:encoder.encode(value.id)},key,encoder.encode(JSON.stringify(value)));
      await store.add({id:value.id,slot:keySlot,iv,ciphertext});
      return {draft_id:value.id,state:'stored_locally_unconfirmed'};
    }
    async function list(binding){
      const canonical=validBinding(binding),all=await store.all(),matches=[];
      for(const item of all){
        if(item.slot!==keySlot)continue;
        const value=await unseal(item);
        if(Object.keys(canonical).every(k=>value.binding[k]===canonical[k]))matches.push(value);
      }
      return matches.sort((a,b)=>a.saved_at-b.saved_at||a.id.localeCompare(b.id));
    }
    async function remove(binding,draftId){
      if(!uuid.test(draftId||''))throw new Error('TRANSCRIPT_DRAFT_INVALID');
      const matches=await list(binding);
      if(!matches.some(item=>item.id===draftId))throw new Error('TRANSCRIPT_DRAFT_BINDING_INVALID');
      await store.remove(draftId);
    }
    return {save,list,remove};
  }
  const api={create,indexedDbStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.NexaTranscriptEncryptedDraft=api;
})(globalThis);
