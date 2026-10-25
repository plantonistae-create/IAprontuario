/* NEXA · Recuperação segura de rascunhos clínicos já existentes
 * Os dados permanecem nos armazenamentos originais (IndexedDB / Supabase).
 * Esta interface nunca envia PHI ao sistema de auditoria ou a novos serviços. */
(()=>{
'use strict';
if(window.__NEXA_HISTORY_RECOVERY_V1__)return;
window.__NEXA_HISTORY_RECOVERY_V1__=true;
const $=id=>document.getElementById(id);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let loading=false,latestLoadedAt=0,attempts=0;
const confirmedInSession=new Set();
function profile(){return window.nexaClinicalRuntime18121?.getProfile?.()||null}
function canonicalId(row){const id=String(row?.encounter_id||row?.id||'');return uuid.test(id)?id:''}
function hasText(row){return !!Object.values(row?.fields||{}).some(v=>typeof v==='string'&&v.trim())}
function date(row){return row?.last_client_saved_at||row?.updated_at||row?.created_at||''}
function formatDate(v){try{return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}catch{return 'Sem data'}}
function candidates(local,remote,userId){
 const all=new Map();
 // Server copy first; prefer local copy if it contains newer, unsynced edits.
 for(const item of remote||[]){
  const id=canonicalId(item);if(id&&String(item.user_id||'')===userId&&hasText(item))all.set(id,{...item,encounter_id:id,source:'servidor'});
 }
 for(const item of local||[]){
  const id=canonicalId(item);if(!id||String(item.owner_user_id||'')!==userId||!hasText(item))continue;
  const found=all.get(id),localDate=Date.parse(date(item)||0)||0,remoteDate=Date.parse(date(found)||0)||0;
  // A conflicting/unsynced local copy must remain visible even if remote is newer.
   if(!found||['pending','conflict'].includes(item.sync_state)||localDate>=remoteDate)all.set(id,{...item,encounter_id:id,source:'este computador'});
 }
 return [...all.values()].sort((a,b)=>(Date.parse(date(b))||0)-(Date.parse(date(a))||0)).slice(0,50);
}
function mount(){
 const host=$('workspaceHistoryPane')||document.querySelector('.nexa-stage-view[data-stage="history"]');
 if(!host)return null;
 let container=$('nexaRecoverHistoryPanel');
 if(container)return container;
 container=document.createElement('section');container.id='nexaRecoverHistoryPanel';container.setAttribute('aria-label','Recuperação de atendimentos');
 container.innerHTML='<div class="nexa-recover-header"><div><strong>Recuperar atendimento</strong><p>Rascunhos locais e da sua conta, inclusive divergências e envios pendentes. Nenhuma cópia será apagada automaticamente.</p></div><button type="button" id="nexaRecoverRefreshBtn">Procurar novamente</button></div><div id="nexaRecoverStatus" role="status" aria-live="polite">Verificando rascunhos…</div><div id="nexaRecoverList"></div>';
 host.prepend(container);
 $('nexaRecoverRefreshBtn').onclick=()=>void refresh(true);
 return container;
}
function style(){
 if($('nexaRecoverStyle'))return;
 const s=document.createElement('style');s.id='nexaRecoverStyle';
 s.textContent=`
 #nexaRecoverHistoryPanel{display:grid;gap:10px;padding:13px;border:1px solid var(--nf-line,var(--nexa-line,#d5e1de));border-radius:13px;background:var(--nf-card,var(--nexa-surface,#fff));margin-bottom:14px;color:var(--nf-text,var(--nexa-text,#1d3733))}
 .nexa-recover-header{display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap}.nexa-recover-header strong{font-size:14px}.nexa-recover-header p{font-size:11px;line-height:1.4;color:var(--nf-muted,var(--nexa-muted,#536b66));margin:3px 0}
 #nexaRecoverRefreshBtn,.nexa-recover-case button{border:1px solid var(--nf-line,var(--nexa-line,#d5e1de));border-radius:9px;padding:9px 12px;cursor:pointer;font-weight:750;background:var(--nf-card2,var(--nexa-surface-2,#f7fbf9));color:var(--nf-text,var(--nexa-text,#1d3733))}
 #nexaRecoverList{display:grid;gap:7px}
 .nexa-recover-case{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px;border:1px solid var(--nf-line,var(--nexa-line,#d5e1de));border-radius:9px;min-width:0;flex-wrap:wrap}
 .nexa-recover-case>div{flex:1;min-width:180px}.nexa-recover-case strong{display:block;overflow-wrap:anywhere;font-size:12px}.nexa-recover-case small{display:block;margin-top:3px;font-size:10px;color:var(--nf-muted,var(--nexa-muted,#536b66))}
 #nexaRecoverStatus{font-size:11px;color:var(--nf-muted,var(--nexa-muted,#536b66))}
 @media(max-width:700px){.nexa-recover-case button{width:100%}}
 `;
 document.head.appendChild(s)
}
async function refresh(force=false){
 if(loading)return;
 const p=profile(),api=window.nexaEncounterAutosave18101,host=mount();
 if(!host||!p?.id||!api?.all)return;
 if(!force&&Date.now()-latestLoadedAt<4000)return;
 loading=true;const status=$('nexaRecoverStatus'),list=$('nexaRecoverList');status.textContent='Verificando rascunhos…';
 let local=[],remote=[],deliveries=[],localError=null,remoteError=null,deliveryError=null;
 try{local=await api.all()}catch(e){localError=e}
 try{
  const c=window.nexaClinicalSupabase18101;
  if(!c)throw new Error('SEM_CONEXAO');
  const cutoff=new Date(Date.now()-14*86400000).toISOString();
  const result=await c.from('consultation_history')
   .select('id,encounter_id,user_id,fields,processing_meta,created_at,updated_at,sync_version,encounter_state,status')
   .eq('user_id',p.id).gte('updated_at',cutoff).order('updated_at',{ascending:false}).limit(150);
  if(result.error)throw result.error;
  remote=result.data||[];
 }catch(e){remoteError=e}
 try{deliveries=await window.nexaAuditOutbox18919?.all?.()||[]}catch(e){deliveryError=e}
 if(profile()?.id!==p.id){loading=false;return}
 const rows=candidates(local,remote,p.id);
 const outboxByEncounter=new Map(deliveries.filter(d=>String(d.owner_user_id||'')===p.id).map(d=>[String(d.source_consultation_id||''),d]));
 list.replaceChildren();
 for(const row of rows){
  const card=document.createElement('div');card.className='nexa-recover-case';
  const desc=document.createElement('div'),heading=document.createElement('strong'),info=document.createElement('small'),button=document.createElement('button');
  const fields=row.fields||{};
  heading.textContent=String(fields.queixa_principal||fields.hda||fields.conduta||'Atendimento com transcrição').trim().slice(0,95);
  const outbox=outboxByEncounter.get(row.encounter_id);
  const conflict=row.sync_state==='conflict'||outbox?.state==='held_conflict';
  const auditReady=row.encounter_state==='ready_for_audit';
  const auditSent=confirmedInSession.has(row.encounter_id)||['sent','locked'].includes(outbox?.state);
  const syncLabel=conflict?'DIVERGÊNCIA: revisar versões':row.sync_state==='pending'?'salvo somente neste computador':row.source==='servidor'||row.sync_state==='synced'?'salvo no servidor':'rascunho';
  const auditLabel=auditReady?(auditSent?'auditoria enviada':outbox?.state==='queued'||outbox?.state==='sending'?'auditoria em fila':'auditoria sem confirmação'):'ainda não confirmado para auditoria';
  info.textContent=`${formatDate(date(row))} · ${row.source} · ${syncLabel} · ${auditLabel}`;
  button.type='button';button.textContent='Reabrir atendimento';
  button.onclick=async()=>{
   if(profile()?.id!==p.id)return;
   button.disabled=true;button.textContent='Recuperando…';
   try{
    const ok=await window.nexaRecoverSavedEncounter?.(row);
    if(ok){status.textContent='Atendimento reaberto. Confira os campos antes de continuar.';return}
    button.textContent='Reabrir atendimento';
   }catch(error){
    status.textContent='Falha ao reabrir: '+String(error?.message||'verifique sua sessão');
    button.textContent='Tentar novamente';
   }finally{button.disabled=false}
  };
  desc.append(heading,info);card.append(desc,button);
  if(conflict&&row.source==='este computador'){
   const review=document.createElement('button');review.type='button';review.textContent='Revisar divergência';
   review.onclick=()=>{const a=window.nexaEncounterConflictReview18102;if(a?.open)a.open(row.encounter_id);else status.textContent='Revisão indisponível. Mantenha a cópia local e reabra o NEXA.'};
   card.append(review);
  }else if(row.sync_state==='pending'&&row.source==='este computador'){
   const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar sincronizar';
   retry.onclick=async()=>{
    if(profile()?.id!==p.id)return;
    retry.disabled=true;
    try{
     const current=await api.get(row.encounter_id);
     if(!current||current.owner_user_id!==p.id)throw new Error('REGISTRO_LOCAL_INDISPONIVEL');
     const result=await api.syncOne(current);
     if(result.conflict)status.textContent='Versões divergentes: revise antes de enviar.';
     else if(result.error)status.textContent='Sincronização pendente: '+String(result.error);
     else status.textContent='Sincronização verificada.';
     await refreshAfterAction();
    }catch(error){status.textContent='Envio não confirmado: '+String(error?.message||error)}
    finally{retry.disabled=false}
   };
   card.append(retry);
  }
  if(auditReady&&!conflict&&!auditSent&&(row.source==='servidor'||row.sync_state==='synced')){
   const audit=document.createElement('button');audit.type='button';audit.textContent='Enviar à auditoria';
   audit.onclick=async()=>{
    if(profile()?.id!==p.id)return;
    audit.disabled=true;
    try{
     const out=window.nexaAuditOutbox18919;
     if(!out?.sessionAuth||!out?.submitRemoteEncounter)throw new Error('ENVIO_INDISPONIVEL');
     const auth=await out.sessionAuth();
     if(auth.userId!==p.id)throw new Error('SESSAO_INVALIDA');
     const result=await out.submitRemoteEncounter(row,auth);
     if(!result.sent)throw new Error(result.error||'AUDITORIA_NAO_CONFIRMADA');
     confirmedInSession.add(row.encounter_id);
     status.textContent='Servidor confirmou o envio do caso à auditoria.';
     await refreshAfterAction();
    }catch(error){status.textContent='Auditoria pendente: '+String(error?.message||error)}
    finally{audit.disabled=false}
   };
   card.append(audit);
  }
  list.append(card);
 }
 status.textContent=rows.length?`${rows.length} atendimento(s) recuperável(is) para esta conta.`:
 'Nenhuma transcrição com texto encontrada nesta conta ou neste perfil do navegador.';
 if(localError||remoteError||deliveryError)status.textContent+=' Alguns registros ou estados de envio estão indisponíveis. Não limpe os dados do navegador.';
 latestLoadedAt=Date.now();loading=false;
}
async function refreshAfterAction(){latestLoadedAt=0;await refresh(true)}
function active(){return document.body?.dataset?.nexaStage==='history'||!!document.querySelector('.nexa-stage-view[data-stage="history"].active:not([hidden])')}
function initialize(){
 style();const node=mount();
 if(node&&active())void refresh();
 if(!node&&attempts++<35)setTimeout(initialize,300);
}
document.addEventListener('click',e=>{
 if(e.target?.closest?.('[data-go="history"],[data-quick="history"],#nfQuickHistory,.nexa-session-tab[data-stage="history"],[data-mobile-stage="history"]'))
  setTimeout(()=>{mount();void refresh(true)},150);
},true);
addEventListener('nexa:encounter-local-saved',()=>{if(active())setTimeout(()=>void refresh(),300)});
addEventListener('online',()=>{if(active())void refresh(true)});
addEventListener('pageshow',()=>{if(active())setTimeout(()=>void refresh(true),150)});
initialize();setTimeout(()=>{if(active())void refresh(true)},1800);
window.nexaRecoverHistoryV1={refresh,candidates};
})();
