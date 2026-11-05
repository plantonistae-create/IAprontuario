/* Local E2E candidate only. No production page loads this file or supplies a key. */
(function(root){
  'use strict';
  const loopback=/^(localhost|127\.0\.0\.1)$/;
  function enabled(){return loopback.test(root.location?.hostname||'')&&
    root.__NEXA_TRANSCRIPT_DRAFT_E2E__?.enabled===true&&
    !!root.NexaTranscriptEncryptedDraft}
  async function attach({dialog,edit,notice,consult,owner,versions,parent}){
    if(!enabled())return null;
    const config=root.__NEXA_TRANSCRIPT_DRAFT_E2E__;
    const binding={owner_user_id:owner,organization_id:consult.organization_id,
      encounter_id:consult.encounter_id,consultation_id:consult.id};
    let key,store,records=[],latest=null,queue=Promise.resolve(),disposed=false;
    const state=document.createElement('p');state.setAttribute('role','status');
    state.setAttribute('data-nexa-draft-state','blocked');notice.after(state);
    const say=(code,message)=>{state.dataset.nexaDraftState=code;state.textContent=message};
    try{
      key=await config.getKey(binding);
      store=root.NexaTranscriptEncryptedDraft.create({key,keySlot:config.keySlot});
      records=await store.list(binding);
    }catch{
      say('blocked','Rascunho cifrado indisponível: chave ausente, incorreta ou armazenamento inacessível. Nada foi descartado.');
      return {flush:async()=>{throw Error('TRANSCRIPT_DRAFT_BLOCKED')},acknowledge:async()=>{}};
    }
    const matching=records.filter(row=>row.parent_version_id===parent.id);
    const stale=records.filter(row=>row.parent_version_id!==parent.id);
    const confirmed=new Set(versions.map(row=>row.source_event_id));
    const recoverable=matching.filter(row=>!confirmed.has(row.id));
    if(stale.length)say('conflict','Há rascunho de uma revisão anterior. Confira as versões antes de reconciliar; nenhum texto será sobrescrito.');
    else say('ready','Rascunho cifrado disponível somente neste ensaio local; ainda não confirmado no servidor.');
    if(recoverable.length){
      const candidate=recoverable.at(-1);
      const restore=document.createElement('button');restore.type='button';
      restore.textContent='Recuperar rascunho cifrado';
      restore.onclick=()=>{
        if(edit.value.trim()&&!root.confirm('Substituir o texto desta janela pelo rascunho selecionado?'))return;
        edit.value=candidate.text;latest=candidate;
        say('local','Rascunho recuperado localmente; salvamento remoto não confirmado.');
      };
      state.after(restore);
    }
    async function persist(text){
      if(disposed||!text.trim())return;
      if(latest?.text===text)return;
      const result=await store.save({binding,parent_version_id:parent.id,text});
      latest={id:result.draft_id,text,parent_version_id:parent.id};
      say('local','Cópia local cifrada; salvamento remoto não confirmado.');
    }
    edit.addEventListener('input',()=>{
      const text=edit.value;
      say('pending','Cifrando rascunho local; ainda não confirmado.');
      queue=queue.catch(()=>{}).then(()=>persist(text)).catch(()=>{
        say('blocked','Falha ao guardar rascunho cifrado. Mantenha esta janela aberta e copie o texto antes de sair.');
        throw Error('TRANSCRIPT_DRAFT_STORAGE_FAILED');
      });
      // Retain a settled queue so a later edit can retry after a storage failure.
      queue.catch(()=>{});
    });
    dialog.addEventListener('close',()=>{disposed=true},{once:true});
    return {
      async flush(text){
        await queue;
        if(!latest||latest.text!==text){await persist(text)}
        if(!latest||latest.text!==text)throw Error('TRANSCRIPT_DRAFT_NOT_STORED');
        return latest.id;
      },
      async acknowledge(id){
        if(latest?.id!==id)return false;
        try{await store.remove(binding,id)}catch{
          say('blocked','Servidor confirmou a correção, mas a limpeza local falhou. O rascunho cifrado foi preservado.');
          return false;
        }
        say('confirmed','Correção confirmada pelo servidor; rascunho local enviado foi removido.');
        return true;
      }
    };
  }
  const api={enabled,attach};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.NexaTranscriptDraftBridge=api;
})(globalThis);
