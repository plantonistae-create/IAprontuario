/* One controller for recording, structured record, hypothesis and destination. */
(function(root){
  'use strict';
  const E=root.NexaRadarEngine;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={critical:'Essencial agora',high:'Importante',moderate:'Complementar',low:'Complementar'};
  const states={to_ask:'A perguntar',asked:'Perguntada · aguardando resposta',confirm:'A confirmar'};
  const cats={history:'História',red_flags:'Sinais de alarme',exam:'Exame físico',vitals:'Sinais vitais',risk:'Antecedentes / riscos',medications:'Medicações',contradiction:'Contradição',differential:'Diferencial'};

  // Presentation-only evidence classification; never changes the clinical facts.
  const evidenceLabels=Object.freeze({
    not_asked:'Não perguntado',awaiting_response:'Perguntado e aguardando resposta',
    does_not_know:'Não sabe',denied_by_patient:'Negado pelo paciente',
    denied_by_companion:'Negado pelo acompanhante',reported_by_patient:'Informado pelo paciente',
    reported_by_companion:'Informado pelo acompanhante',confirmed_by_physician:'Confirmado pelo médico',
    not_applicable:'Não aplicável',contradictory:'Contraditório',
    uncertain_transcript:'Transcrição incerta',
    documented_unattributed:'Informado no registro · origem não atribuída'
  });
  function evidenceSpeaker(ev,transcript){
    if(ev?.section!=='transcript'||typeof ev.quote!=='string'||ev.quote.trim().length<3)return 'unknown';
    const quote=ev.quote.trim();
    const matches=String(transcript||'').split(/\r?\n/).filter(line=>{
      const m=line.match(/^\s*(Médico|Médica|Profissional|Paciente|Acompanhante):\s*(.*)$/i);
      if(!m)return false;
      const speech=m[2].trim();
      return line.includes(quote)||(quote.length>=3&&speech.includes(quote));
    });
    if(matches.length!==1)return 'unknown';
    const role=matches[0].match(/^\s*(Médico|Médica|Profissional|Paciente|Acompanhante):/i)?.[1]?.toLowerCase();
    return role==='paciente'?'patient':role==='acompanhante'?'companion':role?'doctor':'unknown';
  }
  function classifyEvidence(fact={},record=null,context={},incomplete=false){
    const ev=fact.currentEvidence||fact.evidence?.at(-1)||null;
    const speaker=evidenceSpeaker(ev,context.transcript),source=ev?.section||'none';
    const quote=String(ev?.quote||''),factState=fact.state||'not_asked';
    const uncertain=/\b(?:não sei|nao sei|não lembro|nao lembro|não sabe|nao sabe|talvez|acho que|não entendi|nao entendi|sem certeza|não tenho certeza|nao tenho certeza|não consigo afirmar|nao consigo afirmar|não recordo|nao recordo)\b/i.test(quote);
    const denial=/\b(?:nega|negou|negado|não tem|nao tem|sem|nunca|não houve|nao houve|não apresenta|nao apresenta)\b/i.test(quote);
    const confirmed=record?.action==='answer'&&typeof record.documented==='string'&&!!record.documented&&
      typeof context.fields?.[record.section]==='string'&&context.fields[record.section].includes(record.documented)&&
      ['known_present','known_absent'].includes(factState);
    let code='not_asked';
    if(fact.conflict)code='contradictory';
    else if(confirmed)code='confirmed_by_physician';
    else if(record?.action==='not_applicable'&&!['known_present','known_absent'].includes(factState))code='not_applicable';
    else if(uncertain&&source==='transcript'&&(speaker==='patient'||speaker==='companion'))code='does_not_know';
    else if(source==='transcript'&&speaker==='companion')
      code=denial?'denied_by_companion':'reported_by_companion';
    else if(source==='transcript'&&speaker==='patient'&&factState==='known_absent')code='denied_by_patient';
    else if(source==='transcript'&&speaker==='patient'&&factState==='known_present')code='reported_by_patient';
    else if(source==='transcript'&&(factState!=='not_asked'||ev))code='uncertain_transcript';
    else if(['known_present','known_absent'].includes(factState))code='documented_unattributed';
    else if(fact.asked||record?.action==='evaluated')code='awaiting_response';
    else if(factState==='unknown')code=source==='transcript'?'uncertain_transcript':'not_asked';
    if(incomplete&&source==='transcript'&&!['contradictory','confirmed_by_physician','does_not_know'].includes(code))
      code='uncertain_transcript';
    return {code,label:evidenceLabels[code],speaker,source,confidence:'not_measured',
      clinical_fact_state:factState,requires_physician_review:['contradictory','uncertain_transcript',
        'documented_unattributed','reported_by_companion','denied_by_companion'].includes(code),
      resolves_patient_fact:['denied_by_patient','reported_by_patient','confirmed_by_physician'].includes(code)};
  }
  // Generated suggestions and discharge text are not patient evidence for Radar.
  function clinicalContext(fields,transcript,cid){
    const clinicalFields={...fields};
    delete clinicalFields.sugestoes_perguntas;
    delete clinicalFields.orientacoes_alta;
    delete clinicalFields._include_hipotese;
    return {fields:clinicalFields,transcript,cid};
  }
  // The model needs prior answers, not account or encounter identifiers.
  function remoteState(snapshot){return {version:snapshot?.version||1,ledger:snapshot?.ledger||{}};}
  // Trailing horizontal spaces from ASR or textarea reformatting never
  // alter clinical meaning. Normalize only the request identity, not the
  // clinical engine, literal transcript, original fields or provider payload.
  // Preserve words, newlines, punctuation, number separators, negations and CID.
  function trailingSpaceValue(value){
    return typeof value==='string'?value.replace(/[ \t]+(?=\r?$)/gm,''):value;
  }
  function remoteKey(context){
    const fields=context?.fields&&typeof context.fields==='object'&&!Array.isArray(context.fields)
      ?Object.fromEntries(Object.entries(context.fields)
        .sort(([a],[b])=>a<b?-1:a>b?1:0)
        .map(([field,value])=>[field,trailingSpaceValue(value)]))
      :context?.fields;
    return JSON.stringify({...context,fields,transcript:trailingSpaceValue(context?.transcript)});
  }
  function create(adapter){
    let remoteMeta={provider:'unknown',model_version:'unknown',evidence_version:'unknown',prompt_version:'unknown'};let ledger={},state=E.analyze({}),revision=0,controller=null,timer=null,aiTimer=null,aiItems=[],observations=[],lastKey='',lastContext=null,owner='',encounter=crypto.randomUUID(),error='',expanded=false,aiKey='',busy=false,transcriptStatus='idle',transcriptIncomplete=false,lastRequestAt=0;
    let questionTraceTruncated=false;const listeners=new Set(),questionTrace=new Map();
    // Clinician-owned, encounter-bound action history. No separate clinical datastore.
    const clinicalAudit=[];let undoEntry=null;const alertJournal=new Map();
    const validId=x=>typeof x==='string'&&/^(?:conflict:|finding:)?[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(x);
    function logAction(id,action){
      clinicalAudit.push({seq:(clinicalAudit.at(-1)?.seq||0)+1,id,action,at:new Date().toISOString()});
      if(clinicalAudit.length>80)clinicalAudit.shift();
    }
    function reconcileAlerts(alerts){
      const active=new Set();
      for(const item of alerts||[]){
        const id=String(item?.id||'');
        if(!validId(id))continue;
        active.add(id);
        const old=alertJournal.get(id);
        if(old)old.status='active';
        else if(alertJournal.size<80)alertJournal.set(id,{id,concept:String(item.concept||'').slice(0,65),status:'active',firstSeen:new Date().toISOString(),reason:'',
          kind:'finding',evidence:(Array.isArray(item.evidence)?item.evidence:[]).slice(0,2).filter(e=>e&&typeof e.quote==='string').map(e=>({quote:e.quote.slice(0,240),section:String(e.section||'').slice(0,50)}))});
      }
      for(const item of alertJournal.values())if(item.status==='active'&&!active.has(item.id))item.status='pending';
      return [...alertJournal.values()].filter(item=>item.status==='pending').map(item=>({...item}));
    }

    function traceQuestions(items){
      for(const item of Array.isArray(items)?items:[]){
        const id=String(item?.id||''),concept=String(item?.concept||'');
        if(!/^(?:conflict:)?[a-z][A-Za-z0-9_]{0,63}$/.test(id)||!concept||questionTrace.has(id))continue;
        if(questionTrace.size>=150){questionTraceTruncated=true;continue;}
        questionTrace.set(id,{id,concept,question:String(item.question||'').slice(0,360),
          reason:String(item.reason||'').slice(0,360),priority:String(item.priority||'moderate'),
          status:String(item.status||'to_ask'),redFlag:item.redFlag===true,category:String(item.category||'')});
      }
    }
    function snapshot(){return {version:1,owner,encounter,ledger:structuredClone(ledger),questionTrace:[...questionTrace.values()].map(x=>({...x})),questionTraceTruncated,clinicalAudit:clinicalAudit.map(x=>({...x})),alertJournal:[...alertJournal.values()].map(x=>({...x}))};}
    // A streaming transcript usually grows monotonically. Retain one in-flight
    // analysis when new completed utterances only append text, then refresh it.
    // Changing clinical fields, owner, or encounter still invalidates immediately.
    function appendOnly(before,after){
      if(!before||!after)return false;
      const a=String(before.transcript||''),b=String(after.transcript||'');
      if(!b.startsWith(a)||b.length<=a.length)return false;
      // Field insertion order is not new patient evidence. Keep ongoing work
      // when the same fields arrive in a different JS-object key order.
      return remoteKey({...before,transcript:''})===remoteKey({...after,transcript:''});
    }
    function invalidate(){revision++;controller?.abort();controller=null;busy=false;clearTimeout(aiTimer);}
    function publish(){adapter.publish?.(state);listeners.forEach(fn=>fn(state));}
    function recalculate({remote=false,force=false}={}){
      const context=adapter.context(),key=remoteKey(context);
      if(key!==lastKey){
        if(!(busy&&appendOnly(lastContext,context)))invalidate();
        lastKey=key;lastContext=JSON.parse(JSON.stringify(context));aiKey='';
      }
      state=E.analyze(context,ledger,aiItems,observations);
      const previousAlerts=JSON.stringify([...alertJournal.values()].map(a=>[a.id,a.status]));
      state.reviewAlerts=reconcileAlerts(state.alerts);
      // Derived labels are not copied into snapshots or submitted to AI.
      state.evidenceStates=Object.fromEntries(Object.entries(state.facts||{}).map(([id,f])=>
        [id,classifyEvidence(f,ledger[id]||ledger['conflict:'+id]||null,context,transcriptIncomplete)]));
      state.transcriptQuality=transcriptIncomplete?'incomplete':transcriptStatus==='live'?'provisional':'not_measured';
      const alertTransition=previousAlerts!==JSON.stringify([...alertJournal.values()].map(a=>[a.id,a.status]));
      state.alertJournal=[...alertJournal.values()].map(x=>({...x}));
      state.dispositionCaution=state.dispositionCaution||state.reviewAlerts.length>0;
      state.clinicalAudit=clinicalAudit.map(x=>({...x}));
      state.undoAvailable=!!undoEntry&&undoEntry.owner===owner&&undoEntry.encounter===encounter&&undoEntry.afterKey===key;
      state.ledger=structuredClone(ledger);state.error=error;state.busy=busy;state.transcriptStatus=transcriptStatus;state.transcriptIncomplete=transcriptIncomplete;state.revision=revision;state.encounter=encounter;state.radarMeta={...remoteMeta};
      traceQuestions(state.items);state.questionTrace=[...questionTrace.values()];state.questionTraceTruncated=questionTraceTruncated;
      publish();
      if(alertTransition&&owner&&typeof adapter.persist==='function'){
        // Guard asynchronous saves by both authenticated owner and encounter.
        // A pending microtask from a prior session must never persist its state
        // after account/consultation switching.
        const persistOwner=owner,persistEncounter=encounter;
        void Promise.resolve().then(()=>{
          if(owner!==persistOwner||encounter!==persistEncounter)return;
          return adapter.persist('radar_alert_transition');
        }).catch(()=>{
          error='Histórico de alertas não confirmado em armazenamento. Revise antes de encerrar.';
          state.error=error;publish();
        });
      }
      if(remote&&(force||aiKey!==key)&&state.hasContext&&!busy){
        clearTimeout(aiTimer);
        aiTimer=setTimeout(()=>analyzeRemote(),force?0:Math.max(300,1500-(Date.now()-lastRequestAt)));
      }
      return state;
    }
    async function analyzeRemote(){
      if(busy)return;
      lastRequestAt=Date.now();
      invalidate();
      const epoch=revision,encounterAtStart=encounter,context=adapter.context(),key=remoteKey(context);
      // A direct request may precede the first scheduled recalculation. Bind its
      // context before publishing busy state so that recalculate cannot clear it.
      lastKey=key;lastContext=JSON.parse(JSON.stringify(context));aiKey='';
      controller=new AbortController();const requestController=controller,signal=requestController.signal;
      const timeout=setTimeout(()=>requestController.abort(),20000);busy=true;error='';recalculate();
      try{
        const result=await adapter.analyze(context,signal);
        const current=adapter.context();
        if(epoch!==revision||encounterAtStart!==encounter||
           (key!==remoteKey(current)&&!appendOnly(context,current)))return;
        if(!Array.isArray(result?.items))throw new Error('Resposta da IA incompatível com o Radar contextual.');
        aiItems=result.items;observations=Array.isArray(result.observations)?result.observations:[];
        const version=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,80}$/.test(value)?value:'unknown';
        remoteMeta={provider:result.provider==='nexa-core'?'nexa-core':result.provider==='openai'?'openai':'unknown',model_version:version(result.model),evidence_version:version(result.evidence_library_version),prompt_version:'unknown'};
        aiKey=key;
      }catch(e){if(epoch===revision){
        error=signal.aborted?'IA excedeu o tempo limite. Checagens locais continuam disponíveis.':'IA indisponível. Checagens locais continuam disponíveis.';
        aiKey=key; // Do not endlessly repeat a failing request without new evidence.
      }}
      finally{clearTimeout(timeout);if(epoch===revision){
        busy=false;controller=null;recalculate({remote:true});
      }}
    }
    function respond(id,value,action='answer'){
      const item=state.items.find(i=>i.id===id);if(!item)return false;
      const core=['comorbidities','allergies','medicines'].includes(item.concept);
      if(action!=='answer'&&(core||item.category==='contradiction'))return false;
      if(item.category==='contradiction'&&(action!=='answer'||String(value||'').trim().length<12||
        /^(?:sim|não|nao|não sei|nao sei)$/i.test(String(value).trim())))throw new Error('Informe retificação médica explícita, com justificativa.');
      const before=adapter.context(),beforeLedger=structuredClone(ledger),beforeFields=structuredClone(before.fields||{});
      const result=E.answer(before,ledger,item,value,action);
      ledger=result.ledger;
      if(action!=='answer'&&(item.redFlag||item.priority==='critical')){
        // Status-only acknowledgement is not evidence: preserve safety review.
        const safetyId='finding:'+item.concept;
        if(!alertJournal.has(safetyId)&&alertJournal.size<80){
          alertJournal.set(safetyId,{id:safetyId,concept:item.concept,status:'pending',
            firstSeen:new Date().toISOString(),reason:'',kind:'critical_question',
            evidence:(item.evidence||[]).slice(0,2)
              .filter(e=>e&&typeof e.quote==='string')
              .map(e=>({quote:e.quote.slice(0,240),section:String(e.section||'').slice(0,50)}))});
        }
      }
      undoEntry={owner,encounter,id,beforeLedger,beforeFields,afterKey:remoteKey(result.context)};
      logAction(id,action==='answer'?'medical_response':action);
      // A status-only acknowledgement must not create a duplicate remote call.
      if(action!=='answer'&&remoteKey(before)===remoteKey(result.context)){
        recalculate();adapter.persist?.();return true;
      }
      invalidate();aiItems=[];observations=[];adapter.apply(result.context.fields);lastKey='';recalculate({remote:true});adapter.persist?.();return true;
    }
    function undoLast(){
      const entry=undoEntry;
      if(!entry||entry.owner!==owner||entry.encounter!==encounter)return false;
      // Fail closed if any clinical field/transcript changed after the response:
      // never overwrite newer user edits, ASR evidence, or another encounter.
      if(remoteKey(adapter.context())!==entry.afterKey){undoEntry=null;recalculate();return false;}
      const now=adapter.context(),changed=remoteKey({fields:now.fields})!==remoteKey({fields:entry.beforeFields});
      ledger=structuredClone(entry.beforeLedger);
      undoEntry=null;logAction(entry.id,'undo');
      invalidate();aiItems=[];observations=[];
      if(changed)adapter.apply(structuredClone(entry.beforeFields));
      lastKey='';recalculate({remote:changed});adapter.persist?.();
      return true;
    }
    function reviewAlert(id,reason){
      const entry=alertJournal.get(id),text=String(reason||'').trim();
      if(!entry||entry.status!=='pending'||text.length<12||text.length>240)return false;
      entry.status='reviewed';entry.reason=text;
      logAction(entry.id,'alert_reviewed');
      recalculate();adapter.persist?.();return true;
    }
    function reset(user=owner){invalidate();clearTimeout(timer);questionTrace.clear();clinicalAudit.length=0;alertJournal.clear();undoEntry=null;questionTraceTruncated=false;remoteMeta={provider:'unknown',model_version:'unknown',evidence_version:'unknown',prompt_version:'unknown'};ledger={};aiItems=[];observations=[];lastKey='';lastContext=null;aiKey='';error='';transcriptStatus='idle',transcriptIncomplete=false,lastRequestAt=0;owner=user;encounter=crypto.randomUUID();expanded=false;lastRequestAt=0;state=E.analyze({});publish();}
    function restore(saved,user){reset(user);if(saved?.version===1&&saved.owner===user&&user){ledger=saved.ledger||{};encounter=saved.encounter||encounter;
      for(const e of Array.isArray(saved.clinicalAudit)?saved.clinicalAudit.slice(-80):[]){
        if(!validId(e?.id)||!['medical_response','evaluated','dismissed','not_applicable','undo','alert_reviewed'].includes(e?.action)||
           !Number.isSafeInteger(e?.seq)||e.seq<1||typeof e?.at!=='string'||!/^\d{4}-\d\d-\d\dT/.test(e.at))continue;
        clinicalAudit.push({id:e.id,action:e.action,seq:e.seq,at:e.at.slice(0,32)});
      }
      for(const e of Array.isArray(saved.alertJournal)?saved.alertJournal.slice(0,80):[]){
        if(!validId(e?.id)||!validId(e?.concept)||!Object.hasOwn(E.concepts,e.concept)||!['active','pending','reviewed'].includes(e.status)||
          (e.status==='reviewed'&&(typeof e.reason!=='string'||e.reason.trim().length<12)))continue;
        alertJournal.set(e.id,{id:e.id,concept:e.concept,status:e.status,firstSeen:String(e.firstSeen||'').slice(0,32),reason:typeof e.reason==='string'?e.reason.slice(0,240):'',kind:e.kind==='critical_question'?'critical_question':'finding',evidence:Array.isArray(e.evidence)?e.evidence.slice(0,2).filter(x=>x&&typeof x.quote==='string'&&typeof x.section==='string').map(x=>({quote:x.quote.slice(0,240),section:x.section.slice(0,50)})):[]});
      }
      questionTraceTruncated=saved.questionTraceTruncated===true||Array.isArray(saved.questionTrace)&&saved.questionTrace.length>150;
      for(const x of Array.isArray(saved.questionTrace)?saved.questionTrace.slice(0,150):[]){
        const id=String(x?.id||''),concept=String(x?.concept||'');
        if(!/^(?:conflict:)?[a-z][A-Za-z0-9_]{0,63}$/.test(id)||!E.concepts[concept]||questionTrace.has(id))continue;
        questionTrace.set(id,{id,concept,question:String(x.question||'').slice(0,360),
          reason:String(x.reason||'').slice(0,360),priority:String(x.priority||'moderate'),
          status:String(x.status||'to_ask'),redFlag:x.redFlag===true,category:String(x.category||'')});
      }}recalculate();}
    function setOwner(user){if(owner!==user)reset(user);}
    function schedule(){clearTimeout(timer);timer=setTimeout(()=>recalculate({remote:true}),150);}
    return {get state(){return state;},snapshot,restore,reset,setOwner,recalculate,respond,undoLast,reviewAlert,schedule,analyzeRemote,setTranscriptStatus(value){if(['unavailable','stale'].includes(value))transcriptIncomplete=true;if(value==='structured'){transcriptIncomplete=false;value='stopped';}const next=value==='live'&&transcriptIncomplete?'stale':value;if(next!==transcriptStatus){transcriptStatus=next;recalculate();}},subscribe:fn=>listeners.add(fn),get expanded(){return expanded;},toggle(){expanded=!expanded;publish();}};
  }
  function mount(adapter){
    const api=create(adapter),q=id=>document.getElementById(id);
    root.nexaRadar=api;
    document.body.dataset.contextualRadar='1';
    const card=q('realtimeRadarCard');
    if(!card)return api;
    card.innerHTML=`<div id="nfRadarHead"><div><strong>RADAR CLÍNICO</strong><small>Perguntas e alertas que acompanham a consulta.</small></div><span id="radarLiveText" role="status">Aguardando informações</span><span id="ngTranscriptQuality" class="ng-transcript-quality" aria-label="Qualidade da transcrição"></span></div>
      <div id="nexaContextualStatus" aria-live="polite"></div><div id="ngAlertBanner"></div><div id="ngAnalysisStatus" role="status"></div>
      <div class="ng-layout"><div class="ng-main"><nav id="nfRadarTabs" role="tablist" aria-label="Radar clínico">
      <button type="button" id="ngQuestionsTab" role="tab" aria-controls="ngQuestionsPanel" aria-selected="true" tabindex="0">Perguntas</button><button type="button" id="ngRisksTab" role="tab" aria-controls="ngRisksPanel" aria-selected="false" tabindex="-1">Alertas</button></nav>
      <section id="ngQuestionsPanel" class="ng-panel" role="tabpanel" aria-labelledby="ngQuestionsTab"><h4>Próximas perguntas</h4><p class="ng-muted">Ordenadas por prioridade</p><div id="radarQuestions"></div><button type="button" id="nexaRadarMore" hidden></button><p class="ng-conversation">As respostas são reconhecidas na conversa.</p></section>
      <section id="ngRisksPanel" class="ng-panel" role="tabpanel" aria-labelledby="ngRisksTab" hidden><h4>O que exige atenção</h4><div id="ngFindings"></div><div id="ngRiskGaps"></div><div id="ngReviewAlerts" aria-live="polite"></div><p class="ng-muted">Informação ausente não confirma nem exclui um sinal de alarme.</p></section></div>
      <aside class="ng-side"><section class="ng-panel"><h4 class="ng-cyan" id="ngClarifiedTitle">Informações registradas (0)</h4><div id="ngClarified"></div><div class="ng-clinical-audit"><strong>Histórico essencial de ações</strong><div id="ngAuditTrail"></div><button type="button" id="ngUndoLast" disabled>Desfazer última ação clínica</button></div></section><section class="ng-panel ng-confirm"><h4 id="ngConfirmTitle">A confirmar (0)</h4><div id="ngConfirm"></div></section>
      <section class="ng-panel" id="ngDisposition"><h4>▥ Gravidade e possível destino</h4><p id="ngSeverity"></p><strong id="ngDestination"></strong><p id="ngDestinationReason" class="ng-muted"></p><div class="ng-destinations"><span data-destination="alta">Alta</span><span data-destination="reavaliacao">Reavaliação</span><span data-destination="internacao">Internação</span></div><p id="ngPhysician" class="ng-muted"></p></section><p class="ng-muted">A decisão final é médica.</p></aside></div><div id="radarMeta" hidden></div><div id="radarAlerts" hidden></div>`;
    let tab='questions';
    function selectTab(value){tab=value;for(const name of ['questions','risks']){const title=name==='questions'?'Questions':'Risks',selected=tab===name;q('ng'+title+'Tab').setAttribute('aria-selected',String(selected));q('ng'+title+'Tab').tabIndex=selected?0:-1;q('ng'+title+'Panel').hidden=!selected;}}
    const setText=(id,value)=>{const el=q(id);if(el&&el.textContent!==value)el.textContent=value;};
    const setHtml=(id,value)=>{const el=q(id);if(el&&el.dataset.rendered!==value){el.innerHTML=value;el.dataset.rendered=value;}};
    function evidenceOrigin(e){
        if(e?.section!=='transcript')return 'Registro clínico · falante não atribuído';
        const quote=String(e.quote||'').trim(),turns=String(adapter.context()?.transcript||'').split(/\r?\n/);
        const lines=turns.filter(l=>quote.length>=3&&l.includes(quote));
        if(lines.length!==1)return 'Conversa · falante não confirmado';
        const match=lines[0].match(/^\s*(Médico|Médica|Profissional|Paciente|Acompanhante):\s*/i);
        if(!match)return 'Conversa · falante não confirmado';
        return 'Conversa · '+match[1];
      }
      const evidenceHtml=list=>(list||[]).slice(-3).filter(e=>e&&typeof e.quote==='string').map(e=>`<blockquote>${e.questionQuote?`<span>${esc(e.questionQuote)}</span> `:''}“${esc(e.quote)}”<cite>${esc(evidenceOrigin(e))}${e.interpretation==='ai'?' · interpretação da IA, revisar':''}${e.temporal&&e.temporal!=='current'?' · '+esc(({recent:'recente',prior:'prévio',resolved:'resolvido'}[e.temporal]||e.temporal)):''} · confiança não aferida</cite></blockquote>`).join('');
    function rowHtml(i){
      const core=['comorbidities','allergies','medicines'].includes(i.concept);
      const provenance=api.state.evidenceStates?.[i.concept]||classifyEvidence();
      const choices=core?'<button type="button" data-request-detail="1">Sim — descrever</button><button type="button" data-value="Não">Não</button>':
        i.answerType==='boolean'?'<button type="button" data-value="Sim">Sim</button><button type="button" data-value="Não">Não</button>':'';
      const optional=core?'':'<button type="button" data-action="not_applicable">Não se aplica</button><button type="button" data-action="evaluated">Já avaliado</button><button type="button" data-action="dismissed">Dispensar</button>';
      return `<div class="ng-row-head"><span class="ng-priority">${labels[i.priority]}</span><span class="ng-state" data-status="${i.status}">${states[i.status]||states.to_ask}</span><span class="ng-evidence-status" data-evidence-state="${esc(provenance.code)}">${esc(provenance.label)}</span></div><div class="ng-question">${esc(i.question)}</div><div class="ng-reason">${esc(cats[i.category]||'História')}</div><details class="ng-context"><summary>Ver motivo${i.evidence?.length?' e contexto':''}</summary><p>${esc(i.reason)}</p>${evidenceHtml(i.evidence)}${i.askedEvidence?evidenceHtml([i.askedEvidence]):''}</details><details class="ng-manual"><summary>Registrar esclarecimento manual</summary><div class="ng-actions">${choices}<button type="button" data-value="Não sabe informar">Não sabe informar</button>${optional}</div><textarea class="ng-answer" aria-label="${esc(i.question)}" data-answer="${esc(i.id)}" placeholder="${core?'Se sim, descreva a informação confirmada pelo médico':'Esclarecimento confirmado pelo médico'}"></textarea><button type="button" data-save="1">Registrar resposta</button></details>`;
    }
    function updateRows(items){
      const host=q('radarQuestions'),ids=new Set(items.map(i=>i.id));
      if(items.length)[...host.children].filter(el=>!el.dataset.item).forEach(el=>el.remove());
      host.querySelectorAll('[data-item]').forEach(el=>{if(!ids.has(el.dataset.item))el.remove();});
      items.forEach((i,index)=>{
        let row=[...host.children].find(el=>el.dataset.item===i.id);if(!row){row=document.createElement('article');row.className='ng-item';row.dataset.item=i.id;}
        const signature=JSON.stringify(i);
        if(row.dataset.signature!==signature){const draft=row.querySelector('textarea')?.value||'',opened=[...row.querySelectorAll('details[open]')].map(el=>el.className);const focused=row.contains(document.activeElement),selection=row.querySelector('textarea')?.selectionStart;row.innerHTML=rowHtml(i);row.dataset.signature=signature;row.dataset.priority=i.priority;row.querySelector('textarea').value=draft;for(const cls of opened)row.querySelector('.'+cls)?.setAttribute('open','');if(focused){row.querySelector('textarea').focus({preventScroll:true});row.querySelector('textarea').setSelectionRange(selection,selection);}}
        if(host.children[index]!==row)host.insertBefore(row,host.children[index]||null);
      });
    }
    function disposition(state){
      const d=root.nexaDestinationFlow18915?.state||{},names={alta:'Alta',reavaliacao:'Reavaliação',internacao:'Internação'};
      const uncertain=!!state.error||state.transcriptIncomplete||['connecting','unavailable','stale'].includes(state.transcriptStatus);
      const eligible=d.recommended&&!d.recommendation_stale&&!uncertain&&!(state.dispositionCaution&&d.recommended==='alta');
      setText('ngSeverity',state.alerts.length?'Atenção: achado de alerta identificado.':state.dispositionCaution?'Gravidade: dados importantes ainda não esclarecidos.':'Gravidade: em avaliação.');
      setText('ngDestination',eligible?names[d.recommended]+' a considerar':'Em avaliação / dados insuficientes');
      setText('ngDestinationReason',(d.reason?'IA: '+d.reason+' ':'')+(d.recommendation_stale?'Contexto mudou; atualizar recomendação. ': '')+(state.criticalCount?`${state.criticalCount} lacuna(s) essencial(is) podem alterar a avaliação. `:'')+'O destino depende do conjunto de achados e da avaliação médica.');
      card.querySelectorAll('[data-destination]').forEach(el=>el.classList.toggle('ng-selected',!!eligible&&el.dataset.destination===d.recommended));
      setText('ngPhysician',d.final?'Decisão registrada pelo médico: '+names[d.final]+'.':'Nenhuma decisão médica registrada.');
    }
    function render(state){
      const pending=state.items.filter(i=>i.status!=='confirm').length,confirm=state.confirm||[],clarified=state.clarified||[];
      setHtml('nexaContextualStatus',`<span class="ng-orange">● ${pending} pendentes</span><span class="ng-red">● ${confirm.length} a confirmar</span><span class="ng-cyan">● ${clarified.length} informadas</span>${state.alerts.length?`<span class="ng-red">● ${state.alerts.length} alerta(s)</span>`:''}`);
      setText('ngTranscriptQuality',state.transcriptQuality==='incomplete'?'Trecho perdido · revisão necessária':state.transcriptQuality==='provisional'?'Transcrição provisória · confiança não aferida':'');
      q('ngTranscriptQuality').dataset.quality=state.transcriptQuality||'not_measured';
      setText('radarLiveText',state.busy?'Analisando contexto…':({connecting:'Conectando acompanhamento…',live:'Acompanhando a conversa',paused:'Consulta pausada',unavailable:'Acompanhamento indisponível',stale:'Acompanhamento desatualizado',stopped:'Gravação encerrada'}[state.transcriptStatus]||'Aguardando informações'));
      setHtml('ngAlertBanner',state.alerts.length?`<div class="ng-alert-banner">⚠ ${state.alerts.length} alerta(s) ativo(s) <button type="button" data-tab="risks">Ver alertas</button></div>`:
         state.reviewAlerts?.length?`<div class="ng-review-banner">⚠ ${state.reviewAlerts.length} alerta(s) anterior(es) aguardando revisão médica <button type="button" data-tab="risks">Revisar</button></div>`:'');
      const stale=state.transcriptIncomplete||['unavailable','stale'].includes(state.transcriptStatus);
      setHtml('ngAnalysisStatus',state.error||stale?`<p class="ng-error">${esc(state.error||'Há trechos da conversa sem análise. Os dados podem estar desatualizados; revise a transcrição final.')} <button type="button" id="nexaRadarRetry">Tentar novamente</button></p>`:'');
      const visible=api.expanded?state.items:state.items.slice(0,5);updateRows(visible);
      if(!state.items.length)setHtml('radarQuestions',`<p class="ng-muted">${!state.hasContext?'Aguardando informações clínicas.':state.error||stale?'Análise incompleta; não é possível afirmar ausência de lacunas.':'Sem lacunas clínicas relevantes identificadas no momento.'}</p>`);else delete q('radarQuestions').dataset.rendered;
      q('nexaRadarMore').hidden=state.items.length<=5;setText('nexaRadarMore',api.expanded?'Mostrar menos':`Ver outras ${state.items.length-5} sugestões`);
      setText('ngClarifiedTitle',`Informações registradas (${clarified.length})`);
      setHtml('ngClarified',clarified.length?clarified.map(i=>`<details class="ng-evidence-row"><summary><span>${esc(i.label)}</span><span data-evidence-state="${esc(state.evidenceStates?.[i.id]?.code||'not_asked')}">${esc(state.evidenceStates?.[i.id]?.label||'Informado · origem não atribuída')}${i.temporal==='resolved'?' · resolvido':i.temporal==='prior'?' · prévio':''}${state.alerts.some(a=>a.concept===i.id)?' · Alerta':''}</span></summary>${evidenceHtml(i.evidence)}</details>`).join(''):'<p class="ng-muted">Os esclarecimentos aparecerão conforme a conversa evolui.</p>');
      setText('ngConfirmTitle',`A confirmar (${confirm.length})`);
      setHtml('ngConfirm',confirm.length?confirm.map(i=>`<div class="ng-confirm-row"><button type="button" data-question="${esc(i.id)}">${esc(E.concepts[i.concept].label)}</button><span>${i.category==='contradiction'?'Contradição: exige retificação e confirmação médica.':'Resposta incerta: não resolve a pendência.'}</span>${i.evidence?.length?`<details class="ng-evidence-context"><summary>Evidências e origem</summary>${evidenceHtml(i.evidence)}</details>`:''}</div>`).join(''):'<p class="ng-muted">Nenhum ponto a confirmar identificado.</p>');
      setHtml('ngAuditTrail',(state.clinicalAudit||[]).slice(-4).reverse().map(a=>`<div class="ng-audit-event">${esc(E.concepts[a.id.replace(/^conflict:/,'').replace(/^finding:/,'')]?.label||'Dado clínico')} · ${esc(({medical_response:'registrado pelo médico',undo:'ação desfeita',alert_reviewed:'alerta revisado',evaluated:'avaliado',dismissed:'dispensado',not_applicable:'não aplicável'}[a.action]||'ação registrada'))}</div>`).join('')||'<small>Sem ações manuais nesta consulta.</small>');
      q('ngUndoLast').disabled=!state.undoAvailable;
      setHtml('ngFindings',state.alerts.length?state.alerts.map(a=>`<article class="ng-finding"><span class="ng-priority">Achado identificado</span><h4>${esc(E.concepts[a.concept].label)}</h4>${evidenceHtml(a.evidence)}<p>${esc(a.reason)}</p>${a.related?.length?`<button type="button" data-question="${esc(a.related[0])}">Ver perguntas relacionadas</button>`:''}</article>`).join(''):`<p class="ng-muted">${!state.hasContext||stale||state.error?'Dados insuficientes ou análise indisponível para avaliar alertas.':'Nenhum achado de alerta identificado nos dados disponíveis. Isso não determina o destino.'}</p>`);
      const gaps=state.items.filter(i=>i.redFlag||i.priority==='critical'||i.status==='confirm');
      setHtml('ngRiskGaps',gaps.length?`<div class="ng-risk-gaps"><h4>Ainda precisa ser esclarecido</h4>${gaps.slice(0,5).map(i=>`<div><button type="button" data-question="${esc(i.id)}">${esc(E.concepts[i.concept].label)}</button> <small>${states[i.status]||states.to_ask}</small></div>`).join('')}</div>`:'');
      setHtml('ngReviewAlerts',(state.reviewAlerts||[]).map(a=>`<div class="ng-review-alert" data-review-alert-row="${esc(a.id)}"><strong>${esc(E.concepts[a.concept]?.label||a.concept)} — ${a.kind==='critical_question'?'pendência crítica marcada por status':'alerta anteriormente identificado'}</strong><p>Não será encerrado automaticamente. O médico deve documentar a reavaliação.</p><details><summary>Evidência original</summary>${evidenceHtml(a.evidence)}</details><textarea aria-label="Justificativa da revisão do alerta" placeholder="Motivo da reavaliação médica (mínimo 12 caracteres)"></textarea><button type="button" data-review-alert="${esc(a.id)}">Confirmar revisão</button></div>`).join(''));
      disposition(state);
    }
    api.subscribe(render);
    card.addEventListener('click',event=>{
      const btn=event.target.closest('button');if(!btn)return;
      if(btn.id==='ngQuestionsTab'||btn.id==='ngRisksTab')return selectTab(btn.id==='ngQuestionsTab'?'questions':'risks');
      if(btn.id==='ngUndoLast'){if(!api.undoLast())setText('ngAnalysisStatus','Desfazer bloqueado: há novo conteúdo clínico ou não existe ação reversível.');return;}
      if(btn.dataset.reviewAlert){const row=btn.closest('[data-review-alert-row]');if(!row||!api.reviewAlert(btn.dataset.reviewAlert,row.querySelector('textarea')?.value))setText('ngAnalysisStatus','Justificativa médica insuficiente ou alerta ainda ativo.');return;}
      if(btn.dataset.tab)return selectTab(btn.dataset.tab);
      if(btn.dataset.question){selectTab('questions');if(!api.expanded&&api.state.items.findIndex(i=>i.id===btn.dataset.question)>=5)api.toggle();const row=[...card.querySelectorAll('[data-item]')].find(el=>el.dataset.item===btn.dataset.question);if(row){row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView({block:'nearest'});}return;}
      if(btn.id==='nexaRadarMore')return api.toggle();if(btn.id==='nexaRadarRetry'){adapter.retryTranscript?.();return api.analyzeRemote();}
      const row=btn.closest('[data-item]');if(!row)return;
      if(btn.dataset.requestDetail){row.querySelector('textarea')?.focus();return;}
      const action=btn.dataset.action||'answer',value=btn.dataset.value||(btn.dataset.save?row.querySelector('textarea').value:btn.textContent);
      try{api.respond(row.dataset.item,value,action);}catch(e){setText('ngAnalysisStatus',e.message);}
    });
    q('nfRadarTabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();selectTab(event.key==='Home'?'questions':event.key==='End'?'risks':tab==='questions'?'risks':'questions');q(tab==='questions'?'ngQuestionsTab':'ngRisksTab').focus();}});
    document.addEventListener('input',event=>{if(event.target.closest?.('.field[data-key]'))api.schedule();});
    for(const name of ['nexa:destination-state','nexa:destination-restored','nexa:destination-reset'])root.addEventListener(name,()=>disposition(api.state));
    render(api.state);return api;
  }
  function createTranscriptBuffer(){
    const turns=new Map();let sequence=0;
    return {
      ingest(event){
        const id=event.item_id||event.item?.id||event.event_id;if(!id)return false;
        if(!turns.has(id))turns.set(id,{order:sequence++,text:''});
        if(event.type!=='conversation.item.input_audio_transcription.completed')return false;
        const turn=turns.get(id),text=String(event.transcript||'').trim();if(turn.text===text)return false;turn.text=text;return true;
      },
      get text(){return [...turns.values()].sort((a,b)=>a.order-b.order).map(t=>t.text).filter(Boolean).join('\n');},
      clear(){turns.clear();sequence=0;}
    };
  }
  root.NexaRadarController={create,mount,createTranscriptBuffer,clinicalContext,remoteState,classifyEvidence,evidenceSpeaker,evidenceLabels};
})(globalThis);
