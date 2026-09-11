/* NEXA v18.9.15 — Medical destination workflow · 2026-09-11 */
(()=>{
  'use strict';
  if(window.__NEXA_DESTINATION_FLOW_V18_9_15__)return;
  window.__NEXA_DESTINATION_FLOW_V18_9_15__=true;

  const SESSION_KEY='nexa-active-clinical-session-v370';
  const STATE_KEY='nexa-destination-state-v18915';
  const SUPABASE_URL='https://fmkrcieubrlltiggyauc.supabase.co';
  const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZta3JjaWV1YnJsbHRpZ2d5YXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTQzNjQsImV4cCI6MjEwMDU5MDM2NH0.lueZ5Czs3oHGXmQKNhw1egzuSBUOaMWpm3VoZucvIR4';
  const PROCESS_PATH='/functions/v1/process-consultation';
  const ASSISTANT_PATH='/functions/v1/clinical-assistant';
  const OPTIONS=['alta','reavaliacao','internacao'];
  const LABELS={alta:'ALTA',reavaliacao:'REAVALIAÇÃO',internacao:'INTERNAÇÃO'};
  const q=id=>document.getElementById(id);
  const ta=key=>document.querySelector(`.field[data-key="${key}"] textarea`);
  const now=()=>new Date().toISOString();
  const originalFetch=window.fetch.bind(window);
  const storageProto=window.Storage?.prototype;
  const originalSetItem=storageProto?.setItem;
  let storageWriting=false;
  let requestEpoch=0;
  let activeController=null;
  let lastProcessSeen=false;
  let recommendationTimer=null;
  let authHeaders={};

  const blank=()=>({recommended:'',final:'',status:'pending',source:'',updated_at:now(),reason:'',recommendation_stale:false});
  let state=blank();

  function normalizeDestination(value){
    const s=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(/intern/.test(s))return 'internacao';
    if(/reavali|observa|avaliacao/.test(s))return 'reavaliacao';
    if(/\balta\b/.test(s))return 'alta';
    return '';
  }
  function safeState(value){
    const src=value&&typeof value==='object'?value:{};
    const recommended=normalizeDestination(src.recommended);
    const final=normalizeDestination(src.final);
    const status=['pending','recommended','confirmed','altered'].includes(src.status)?src.status:(final?'confirmed':recommended?'recommended':'pending');
    return {recommended,final,status,source:String(src.source||''),updated_at:String(src.updated_at||now()),reason:String(src.reason||''),recommendation_stale:!!src.recommendation_stale};
  }
  function emit(type,detail={}){window.dispatchEvent(new CustomEvent(type,{detail:{...state,...detail}}))}

  function ensureUi(){
    if(q('nexaDestinationMedicalCard'))return q('nexaDestinationMedicalCard');
    const anchor=q('conductBlock')||q('clinicalPlanBlock')||document.querySelector('.panel-right');
    if(!anchor)return null;
    const root=document.createElement('section');
    root.id='nexaDestinationMedicalCard';
    root.className='field workflow-step';
    root.dataset.destinationMedicalFlow='1';
    root.innerHTML=`
      <div class="field-head"><label>Destino / desfecho clínico</label><span id="nexaDestinationStatus" class="save-state unsaved">Pendente</span></div>
      <div class="clinical-validation-note">⚠ Recomendação assistiva. A decisão final é sempre médica.</div>
      <div id="nexaDestinationRecommendation" style="margin-top:8px;font-weight:800">Aguardando processamento clínico.</div>
      <div id="nexaDestinationReason" class="hint" style="margin-top:4px"></div>
      <div id="nexaDestinationFinal" style="margin-top:8px"></div>
      <div class="conduct-actions" style="margin-top:9px">
        <button class="btn" id="nexaDestinationConfirmBtn" type="button">Confirmar recomendação</button>
        <button class="btn ghost" id="nexaDestinationChangeBtn" type="button">Alterar destino</button>
        <button class="btn ghost" id="nexaDestinationRefreshBtn" type="button">Atualizar recomendação</button>
      </div>
      <div id="nexaDestinationChangePanel" style="display:none;margin-top:9px;border-top:1px solid var(--hair);padding-top:8px">
        <div class="hint">Selecione a decisão médica final:</div>
        <div class="conduct-actions" style="margin-top:7px">
          <button class="btn ghost" data-nexa-destination-choice="alta" type="button">Alta</button>
          <button class="btn ghost" data-nexa-destination-choice="reavaliacao" type="button">Reavaliação</button>
          <button class="btn ghost" data-nexa-destination-choice="internacao" type="button">Internação</button>
          <button class="btn ghost" id="nexaDestinationCancelChangeBtn" type="button">Cancelar</button>
        </div>
      </div>`;
    anchor.insertAdjacentElement?.('afterend',root) || anchor.appendChild(root);
    q('nexaDestinationConfirmBtn')?.addEventListener('click',confirmRecommendation);
    q('nexaDestinationChangeBtn')?.addEventListener('click',()=>{q('nexaDestinationChangePanel').style.display='block'});
    q('nexaDestinationCancelChangeBtn')?.addEventListener('click',()=>{q('nexaDestinationChangePanel').style.display='none'});
    q('nexaDestinationRefreshBtn')?.addEventListener('click',()=>requestRecommendation('manual-refresh'));
    root.querySelectorAll('[data-nexa-destination-choice]').forEach(btn=>btn.addEventListener('click',()=>setPhysicianFinal(btn.dataset.nexaDestinationChoice)));
    render();
    return root;
  }

  function render(){
    ensureUi();
    const status=q('nexaDestinationStatus'),rec=q('nexaDestinationRecommendation'),reason=q('nexaDestinationReason'),fin=q('nexaDestinationFinal'),confirm=q('nexaDestinationConfirmBtn');
    if(status){
      const map={pending:'Pendente',recommended:'Recomendado pela IA',confirmed:'Confirmado pelo médico',altered:'Alterado pelo médico'};
      status.textContent=map[state.status]||state.status;
      status.className='save-state '+(['confirmed','altered'].includes(state.status)?'saved':'unsaved');
    }
    if(rec)rec.textContent=state.recommended?`Recomendação da IA: ${LABELS[state.recommended]}`:'Aguardando recomendação da IA.';
    if(reason)reason.textContent=(state.reason||'')+(state.recommendation_stale?' · Contexto mudou; recomendação pode precisar ser atualizada.':'');
    if(fin)fin.innerHTML=state.final?`<strong>DECISÃO MÉDICA FINAL: ${LABELS[state.final]}</strong>`:'<span class="hint">Nenhum desfecho final confirmado.</span>';
    if(confirm)confirm.disabled=!state.recommended;
    document.body?.setAttribute('data-nexa-destination-status',state.status);
  }

  function persist(){
    state.updated_at=now();
    try{localStorage.setItem(STATE_KEY,JSON.stringify(state))}catch{}
    try{
      const raw=localStorage.getItem(SESSION_KEY);
      if(raw){const snap=JSON.parse(raw);snap.destinationState={...state};storageWriting=true;originalSetItem?.call(localStorage,SESSION_KEY,JSON.stringify(snap));storageWriting=false}
    }catch{storageWriting=false}
    render();emit('nexa:destination-state');
  }
  function restore(value,source='restore'){
    state=safeState(value);render();emit('nexa:destination-restored',{restore_source:source});return {...state};
  }
  function reset(reason='reset'){
    if(activeController)try{activeController.abort(reason)}catch{}
    activeController=null;requestEpoch++;
    state=blank();lastProcessSeen=false;
    try{localStorage.removeItem(STATE_KEY)}catch{}
    persist();emit('nexa:destination-reset',{reason});
  }

  if(storageProto&&originalSetItem){
    storageProto.setItem=function(key,value){
      if(!storageWriting&&this===localStorage&&key===SESSION_KEY){
        try{const snap=JSON.parse(value);snap.destinationState={...state};value=JSON.stringify(snap)}catch{}
      }
      return originalSetItem.call(this,key,value);
    };
  }

  function setRecommendation(destination,source='ai',reason=''){
    destination=normalizeDestination(destination);if(!destination)return false;
    state.recommended=destination;state.reason=String(reason||'');state.recommendation_stale=false;
    if(!['confirmed','altered'].includes(state.status)){state.status='recommended';state.source=source}
    persist();emit('nexa:destination-recommended',{recommendation_source:source});return true;
  }
  function confirmRecommendation(){
    if(!state.recommended)return false;
    state.final=state.recommended;state.status='confirmed';state.source='physician_confirmed';state.recommendation_stale=false;persist();
    q('nexaDestinationChangePanel')&&(q('nexaDestinationChangePanel').style.display='none');emit('nexa:destination-physician-final');return true;
  }
  function setPhysicianFinal(destination){
    destination=normalizeDestination(destination);if(!destination)return false;
    state.final=destination;state.status=state.recommended===destination?'confirmed':'altered';state.source='physician';persist();
    q('nexaDestinationChangePanel')&&(q('nexaDestinationChangePanel').style.display='none');emit('nexa:destination-physician-final');return true;
  }

  function contextText(){
    const fields=[['QP','queixa_principal'],['HDA','hda'],['COMORBIDADES','comorbidades'],['ANTECEDENTES','antecedentes'],['MEDICAÇÕES','medicacoes'],['ALERGIAS','alergias'],['HIPÓTESE','hipotese_diagnostica'],['EXAME FÍSICO','exame_fisico'],['CONDUTAS','conduta']];
    const parts=fields.map(([label,key])=>{const v=ta(key)?.value?.trim();return v?`${label}: ${v}`:''}).filter(Boolean);
    const exams=q('suggestedExams')?.value?.trim();const rx=q('suggestedPrescription')?.value?.trim();
    if(exams)parts.push(`EXAMES SUGERIDOS: ${exams}`);if(rx)parts.push(`PRESCRIÇÃO: ${rx}`);
    return parts.join('\n\n').slice(0,12000);
  }
  function currentAuth(){
    let access='';let userId='';
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';if(!key.includes('auth-token'))continue;
        const parsed=JSON.parse(localStorage.getItem(key)||'{}');const obj=parsed?.currentSession||parsed;
        if(obj?.access_token){access=obj.access_token;userId=obj.user?.id||parsed?.user?.id||'';break}
      }
    }catch{}
    return {access,userId};
  }
  function parseAssistantAnswer(answer){
    const text=String(answer||'').trim();
    try{const m=text.match(/\{[\s\S]*\}/);if(m){const obj=JSON.parse(m[0]);return {destination:normalizeDestination(obj.destination||obj.destino||obj.final),reason:String(obj.reason||obj.rationale||obj.justificativa||'')}}}catch{}
    return {destination:normalizeDestination(text),reason:''};
  }
  function extractFromProcess(payload){
    const candidates=[payload?.destination,payload?.destino,payload?.disposition,payload?.desfecho,payload?.fields?.destination,payload?.fields?.destino,payload?.fields?.disposition,payload?.fields?.desfecho];
    for(const c of candidates){const d=normalizeDestination(typeof c==='object'?(c?.recommended||c?.value||c?.destination||c?.destino):c);if(d)return {destination:d,reason:typeof c==='object'?String(c.reason||c.rationale||''):''}}
    return null;
  }
  async function requestRecommendation(trigger='context'){
    if(!lastProcessSeen&&trigger!=='manual-refresh')return false;
    const context=contextText();if(context.length<20)return false;
    if(activeController)try{activeController.abort('superseded')}catch{}
    const epoch=++requestEpoch;const controller=new AbortController();activeController=controller;
    const btn=q('nexaDestinationRefreshBtn');if(btn){btn.disabled=true;btn.textContent='Atualizando…'}
    try{
      const local=currentAuth();const authorization=authHeaders.Authorization||authHeaders.authorization||(local.access?`Bearer ${local.access}`:'');
      if(!authorization)throw new Error('Sessão indisponível para recomendar destino.');
      const r=await originalFetch(SUPABASE_URL+ASSISTANT_PATH,{method:'POST',headers:{Authorization:authorization,apikey:authHeaders.apikey||SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({question:'Com base exclusivamente no contexto clínico, recomende UM destino entre ALTA, REAVALIAÇÃO ou INTERNAÇÃO. Responda somente JSON no formato {"destination":"alta|reavaliacao|internacao","reason":"justificativa clínica curta"}. Não trate a recomendação como decisão médica final.',source_mode:'hybrid',specialty:'auto',context,history:[]}),signal:controller.signal});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Falha ao recomendar destino (${r.status}).`);if(epoch!==requestEpoch)return false;
      const parsed=parseAssistantAnswer(d.answer||d);if(!parsed.destination)throw new Error('A IA não retornou um destino válido.');
      return setRecommendation(parsed.destination,'ai_clinical_assistant',parsed.reason);
    }catch(error){
      if(error?.name!=='AbortError'&&epoch===requestEpoch){state.reason=`Recomendação indisponível: ${error.message}`;persist();emit('nexa:destination-recommendation-error',{message:error.message})}
      return false;
    }finally{if(epoch===requestEpoch)activeController=null;if(btn){btn.disabled=false;btn.textContent='Atualizar recomendação'}}
  }
  function scheduleRecommendation(trigger='context',delay=500){clearTimeout(recommendationTimer);recommendationTimer=setTimeout(()=>requestRecommendation(trigger),delay)}

  function markContextChanged(reason='context-changed'){
    if(!state.recommended&&!state.final)return;
    state.recommendation_stale=true;
    if(!['confirmed','altered'].includes(state.status)){state.status='pending';state.recommended='';state.reason='Contexto clínico alterado; aguardando nova recomendação.'}
    persist();emit('nexa:destination-context-changed',{reason});
  }

  window.fetch=async function destinationAwareFetch(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes(PROCESS_PATH)){
      const headers=init?.headers||{};authHeaders={Authorization:headers.Authorization||headers.authorization||authHeaders.Authorization,apikey:headers.apikey||authHeaders.apikey};
      const response=await originalFetch(input,init);
      if(response.ok){
        response.clone().json().then(payload=>{
          lastProcessSeen=true;
          if(!['confirmed','altered'].includes(state.status)){state=blank();render()}
          const direct=extractFromProcess(payload);
          if(direct)setRecommendation(direct.destination,'process_consultation',direct.reason);
          else scheduleRecommendation('processed',650);
        }).catch(()=>{});
      }
      return response;
    }
    return originalFetch(input,init);
  };

  function noteTextWithDestination(){
    const labels={queixa_principal:'QUEIXA PRINCIPAL',hda:'HISTÓRIA DA DOENÇA ATUAL',alergias:'ALERGIAS',comorbidades:'COMORBIDADES',medicacoes:'MEDICAÇÕES EM USO',antecedentes:'ANTECEDENTES',exame_fisico:'EXAME FÍSICO',hipotese_diagnostica:'HIPÓTESE DIAGNÓSTICA',conduta:'CONDUTAS'};
    const keys=['queixa_principal','hda','alergias','comorbidades','medicacoes','antecedentes','exame_fisico'];if(q('includeDiagnosis')?.checked)keys.push('hipotese_diagnostica');keys.push('conduta');
    const parts=keys.filter(k=>ta(k)?.value?.trim()).map(k=>`${labels[k]}:\n${ta(k).value.trim()}`);
    if(state.final)parts.push(`DESTINO:\n${LABELS[state.final]}`);
    return parts.join('\n\n');
  }

  async function copyFinalRecord(event){
    if(!state.final)return;
    event.preventDefault();event.stopImmediatePropagation();
    const btn=q('copyBtn');
    try{await navigator.clipboard.writeText(noteTextWithDestination());if(btn){const old=btn.textContent;btn.textContent='Copiado ✓';setTimeout(()=>btn.textContent=old,1200)}}catch{emit('nexa:destination-copy-error')}
  }

  function currentFieldFingerprint(){
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim().slice(0,700);
    return {qp:norm(ta('queixa_principal')?.value),hda:norm(ta('hda')?.value),hyp:norm(ta('hipotese_diagnostica')?.value),conduct:norm(ta('conduta')?.value)};
  }
  function recordFingerprint(fields={}){
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim().slice(0,700);
    return {qp:norm(fields.queixa_principal),hda:norm(fields.hda),hyp:norm(fields.hipotese_diagnostica),conduct:norm(fields.conduta)};
  }
  function scoreFingerprint(a,b){return ['qp','hda','hyp','conduct'].reduce((n,k)=>n+(a[k]&&b[k]&&a[k]===b[k]?1:0),0)}
  async function historyRecords(){
    const {access,userId}=currentAuth();if(!access||!userId)return [];
    const url=`${SUPABASE_URL}/rest/v1/consultation_history?select=id,fields,processing_meta,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=20`;
    const r=await originalFetch(url,{headers:{Authorization:`Bearer ${access}`,apikey:SUPABASE_ANON_KEY}});if(!r.ok)return [];return await r.json().catch(()=>[]);
  }
  async function matchingHistory(){
    const records=await historyRecords(),fp=currentFieldFingerprint();let best=null,bestScore=0;
    for(const row of records){const score=scoreFingerprint(fp,recordFingerprint(row.fields||{}));if(score>bestScore){bestScore=score;best=row}}
    return bestScore>=2?best:null;
  }
  async function persistDestinationToHistory(){
    if(!state.final&&!state.recommended)return false;
    const row=await matchingHistory();if(!row)return false;
    const {access,userId}=currentAuth();if(!access||!userId)return false;
    const meta={...(row.processing_meta||{}),destinationState:{...state}};
    const url=`${SUPABASE_URL}/rest/v1/consultation_history?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(userId)}`;
    const r=await originalFetch(url,{method:'PATCH',headers:{Authorization:`Bearer ${access}`,apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({processing_meta:meta,updated_at:now()})});
    if(r.ok){emit('nexa:destination-history-saved',{history_id:row.id});return true}return false;
  }
  async function restoreDestinationFromHistory(){
    const row=await matchingHistory();const saved=row?.processing_meta?.destinationState||row?.processing_meta?.destination;
    if(saved){restore(saved,'history');return true}return false;
  }

  function bind(){
    ensureUi();
    q('resetBtn')?.addEventListener('click',()=>reset('new-consultation'),true);
    q('nexaRestoreSessionBtn')?.addEventListener('click',()=>setTimeout(()=>{try{const snap=JSON.parse(localStorage.getItem(SESSION_KEY)||'{}');if(snap.destinationState)restore(snap.destinationState,'autosave')}catch{}},0));
    q('copyBtn')?.addEventListener('click',copyFinalRecord,true);
    q('updateHistoryBtn')?.addEventListener('click',()=>setTimeout(()=>persistDestinationToHistory(),900));
    q('historyList')?.addEventListener('click',()=>setTimeout(()=>restoreDestinationFromHistory(),80));
    const hyp=ta('hipotese_diagnostica'),conduct=ta('conduta');
    hyp?.addEventListener('input',()=>markContextChanged('hypothesis'));
    conduct?.addEventListener('input',()=>markContextChanged('conduct'));
    ['generateExamsBtn','generatePrescriptionBtn','generateBothPlanBtn','applyRxMissingDataBtn'].forEach(id=>q(id)?.addEventListener('click',()=>markContextChanged('plan')));
    try{const snap=JSON.parse(localStorage.getItem(SESSION_KEY)||'{}');if(snap.destinationState)restore(snap.destinationState,'boot-autosave')}catch{}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();

  window.nexaDestinationFlow18915={
    get state(){return {...state}},
    normalizeDestination,
    restore,
    reset,
    setRecommendation,
    confirmRecommendation,
    setPhysicianFinal,
    markContextChanged,
    requestRecommendation,
    persistDestinationToHistory,
    restoreDestinationFromHistory,
    noteTextWithDestination
  };
})();
