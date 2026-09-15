/* One controller for recording, structured record, hypothesis and destination. */
(function(root){
  'use strict';
  const E=root.NexaRadarEngine;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={critical:'Essencial agora',high:'Importante',moderate:'Complementar',low:'Complementar'};
  const states={to_ask:'A perguntar',asked:'Perguntada · aguardando resposta',confirm:'A confirmar'};
  const cats={history:'História',red_flags:'Sinais de alarme',exam:'Exame físico',vitals:'Sinais vitais',risk:'Antecedentes / riscos',medications:'Medicações',contradiction:'Contradição',differential:'Diferencial'};
  function create(adapter){
    let ledger={},state=E.analyze({}),revision=0,controller=null,timer=null,aiTimer=null,aiItems=[],observations=[],lastKey='',owner='',encounter=crypto.randomUUID(),error='',expanded=false,aiKey='',busy=false,transcriptStatus='idle',lastRequestAt=0;
    const listeners=new Set();
    function snapshot(){return {version:1,owner,encounter,ledger:structuredClone(ledger)};}
    function invalidate(){revision++;controller?.abort();controller=null;busy=false;clearTimeout(aiTimer);}
    function publish(){adapter.publish?.(state);listeners.forEach(fn=>fn(state));}
    function recalculate({remote=false,force=false}={}){
      const context=adapter.context(),key=JSON.stringify(context);
      if(key!==lastKey){invalidate();aiItems=[];observations=[];lastKey=key;aiKey='';error='';}
      state=E.analyze(context,ledger,aiItems,observations);state.ledger=structuredClone(ledger);state.error=error;state.busy=busy;state.transcriptStatus=transcriptStatus;state.revision=revision;state.encounter=encounter;
      publish();if(remote&&(force||aiKey!==key)&&state.hasContext){clearTimeout(aiTimer);aiTimer=setTimeout(()=>analyzeRemote(),force?0:Math.max(650,12000-(Date.now()-lastRequestAt)));}
      return state;
    }
    async function analyzeRemote(){
      lastRequestAt=Date.now();
      invalidate();const epoch=revision,context=adapter.context(),key=JSON.stringify(context);controller=new AbortController();const requestController=controller,signal=requestController.signal;
      const timeout=setTimeout(()=>requestController.abort(),20000);busy=true;error='';recalculate();
      try{
        const result=await adapter.analyze(context,signal);
        if(epoch!==revision||key!==JSON.stringify(adapter.context()))return;
        if(!Array.isArray(result?.items))throw new Error('Resposta da IA incompatível com o Radar contextual.');
        aiItems=result.items;observations=Array.isArray(result.observations)?result.observations:[];aiKey=key;
      }catch(e){if(epoch===revision){error=signal.aborted?'IA excedeu o tempo limite. Checagens locais continuam disponíveis.':'IA indisponível. Checagens locais continuam disponíveis.';}}
      finally{clearTimeout(timeout);if(epoch===revision){busy=false;controller=null;recalculate();}}
    }
    function respond(id,value,action='answer'){
      const item=state.items.find(i=>i.id===id);if(!item)return false;
      const result=E.answer(adapter.context(),ledger,item,value,action);ledger=result.ledger;
      invalidate();aiItems=[];observations=[];adapter.apply(result.context.fields);lastKey='';recalculate({remote:true});adapter.persist?.();return true;
    }
    function reset(user=owner){invalidate();clearTimeout(timer);ledger={};aiItems=[];observations=[];lastKey='';aiKey='';error='';transcriptStatus='idle',lastRequestAt=0;owner=user;encounter=crypto.randomUUID();expanded=false;lastRequestAt=0;state=E.analyze({});publish();}
    function restore(saved,user){reset(user);if(saved?.version===1&&saved.owner===user&&user){ledger=saved.ledger||{};encounter=saved.encounter||encounter;}recalculate();}
    function setOwner(user){if(owner!==user)reset(user);}
    function schedule(){invalidate();clearTimeout(timer);timer=setTimeout(()=>recalculate({remote:true}),220);}
    return {get state(){return state;},snapshot,restore,reset,setOwner,recalculate,respond,schedule,analyzeRemote,setTranscriptStatus(value){transcriptStatus=value;recalculate();},subscribe:fn=>listeners.add(fn),get expanded(){return expanded;},toggle(){expanded=!expanded;publish();}};
  }
  function mount(adapter){
    const api=create(adapter),q=id=>document.getElementById(id);
    root.nexaRadar=api;
    document.body.dataset.contextualRadar='1';
    const card=q('realtimeRadarCard');
    if(!card)return api;
    card.innerHTML=`<div id="nfRadarHead"><div><strong>RADAR CLÍNICO</strong><small>Perguntas e alertas que acompanham a consulta.</small></div><span id="radarLiveText" role="status">Aguardando informações</span></div>
      <div id="nexaContextualStatus" aria-live="polite"></div><div id="ngAlertBanner"></div><div id="ngAnalysisStatus" role="status"></div>
      <div class="ng-layout"><div class="ng-main"><nav id="nfRadarTabs" role="tablist" aria-label="Radar clínico">
      <button type="button" id="ngQuestionsTab" role="tab" aria-controls="ngQuestionsPanel" aria-selected="true" tabindex="0">Perguntas da consulta</button><button type="button" id="ngRisksTab" role="tab" aria-controls="ngRisksPanel" aria-selected="false" tabindex="-1">Riscos e alertas</button></nav>
      <section id="ngQuestionsPanel" class="ng-panel" role="tabpanel" aria-labelledby="ngQuestionsTab"><h4>Próximas perguntas</h4><p class="ng-muted">Ordenadas por prioridade</p><div id="radarQuestions"></div><button type="button" id="nexaRadarMore" hidden></button><p class="ng-conversation">As respostas são reconhecidas na conversa.</p></section>
      <section id="ngRisksPanel" class="ng-panel" role="tabpanel" aria-labelledby="ngRisksTab" hidden><h4>O que exige atenção</h4><div id="ngFindings"></div><div id="ngRiskGaps"></div><p class="ng-muted">Informação ausente não confirma nem exclui um sinal de alarme.</p></section></div>
      <aside class="ng-side"><section class="ng-panel"><h4 class="ng-green" id="ngClarifiedTitle">✓ Esclarecidas (0)</h4><div id="ngClarified"></div></section><section class="ng-panel ng-confirm"><h4 id="ngConfirmTitle">A confirmar (0)</h4><div id="ngConfirm"></div></section>
      <section class="ng-panel" id="ngDisposition"><h4>▥ Gravidade e possível destino</h4><p id="ngSeverity"></p><strong id="ngDestination"></strong><p id="ngDestinationReason" class="ng-muted"></p><div class="ng-destinations"><span data-destination="alta">Alta</span><span data-destination="reavaliacao">Reavaliação</span><span data-destination="internacao">Internação</span></div><p id="ngPhysician" class="ng-muted"></p></section><p class="ng-muted">A decisão final é médica.</p></aside></div><div id="radarMeta" hidden></div><div id="radarAlerts" hidden></div>`;
    let tab='questions';
    function selectTab(value){tab=value;for(const name of ['questions','risks']){const title=name==='questions'?'Questions':'Risks',selected=tab===name;q('ng'+title+'Tab').setAttribute('aria-selected',String(selected));q('ng'+title+'Tab').tabIndex=selected?0:-1;q('ng'+title+'Panel').hidden=!selected;}}
    const setText=(id,value)=>{const el=q(id);if(el&&el.textContent!==value)el.textContent=value;};
    const setHtml=(id,value)=>{const el=q(id);if(el&&el.dataset.rendered!==value){el.innerHTML=value;el.dataset.rendered=value;}};
    const evidenceHtml=list=>(list||[]).slice(-3).map(e=>`<blockquote>${e.questionQuote?`<span>${esc(e.questionQuote)}</span> `:''}“${esc(e.quote)}”<cite>${e.section==='transcript'?'Conversa':esc(e.section.replaceAll('_',' '))}${e.temporal&&e.temporal!=='current'?' · '+({recent:'recente',prior:'prévio',resolved:'resolvido'}[e.temporal]||e.temporal):''}</cite></blockquote>`).join('');
    function rowHtml(i){return `<div class="ng-row-head"><span class="ng-priority">${labels[i.priority]}</span><span class="ng-state" data-status="${i.status}">${states[i.status]||states.to_ask}</span></div><div class="ng-question">${esc(i.question)}</div><div class="ng-reason">${esc(cats[i.category]||'História')}</div><details class="ng-context"><summary>Ver motivo${i.evidence?.length?' e contexto':''}</summary><p>${esc(i.reason)}</p>${evidenceHtml(i.evidence)}${i.askedEvidence?evidenceHtml([i.askedEvidence]):''}</details><details class="ng-manual"><summary>Registrar esclarecimento manual</summary><div class="ng-actions">${i.answerType==='boolean'?'<button type="button" data-value="Sim">Sim</button><button type="button" data-value="Não">Não</button>':''}<button type="button" data-value="Não sabe informar">Não sabe informar</button><button type="button" data-action="not_applicable">Não se aplica</button><button type="button" data-action="evaluated">Já avaliado</button><button type="button" data-action="dismissed">Dispensar</button></div><textarea class="ng-answer" aria-label="${esc(i.question)}" data-answer="${esc(i.id)}" placeholder="Esclarecimento confirmado pelo médico"></textarea><button type="button" data-save="1">Registrar resposta</button></details>`;}
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
      const uncertain=!!state.error||['connecting','unavailable','stale'].includes(state.transcriptStatus);
      const eligible=d.recommended&&!d.recommendation_stale&&!uncertain&&!(state.dispositionCaution&&d.recommended==='alta');
      setText('ngSeverity',state.alerts.length?'Atenção: achado de alerta identificado.':state.dispositionCaution?'Gravidade: dados importantes ainda não esclarecidos.':'Gravidade: em avaliação.');
      setText('ngDestination',eligible?names[d.recommended]+' a considerar':'Em avaliação / dados insuficientes');
      setText('ngDestinationReason',(d.reason?'IA: '+d.reason+' ':'')+(d.recommendation_stale?'Contexto mudou; atualizar recomendação. ': '')+(state.criticalCount?`${state.criticalCount} lacuna(s) essencial(is) podem alterar a avaliação. `:'')+'O destino depende do conjunto de achados e da avaliação médica.');
      card.querySelectorAll('[data-destination]').forEach(el=>el.classList.toggle('ng-selected',!!eligible&&el.dataset.destination===d.recommended));
      setText('ngPhysician',d.final?'Decisão registrada pelo médico: '+names[d.final]+'.':'Nenhuma decisão médica registrada.');
    }
    function render(state){
      const pending=state.items.filter(i=>i.status!=='confirm').length,confirm=state.confirm||[],clarified=state.clarified||[];
      setHtml('nexaContextualStatus',`<span class="ng-orange">● ${pending} pendentes</span><span class="ng-red">● ${confirm.length} a confirmar</span><span class="ng-green">● ${clarified.length} esclarecidas</span>${state.alerts.length?`<span class="ng-red">● ${state.alerts.length} alerta(s)</span>`:''}`);
      setText('radarLiveText',state.busy?'Analisando contexto…':({connecting:'Conectando acompanhamento…',live:'Acompanhando a conversa',paused:'Consulta pausada',unavailable:'Acompanhamento indisponível',stale:'Acompanhamento desatualizado',stopped:'Gravação encerrada'}[state.transcriptStatus]||'Aguardando informações'));
      setHtml('ngAlertBanner',state.alerts.length?`<div class="ng-alert-banner">⚠ ${state.alerts.length} achado(s) de alerta identificado(s) <button type="button" data-tab="risks">Ver alertas</button></div>`:'');
      const stale=['unavailable','stale'].includes(state.transcriptStatus);
      setHtml('ngAnalysisStatus',state.error||stale?`<p class="ng-error">${esc(state.error||'Acompanhamento da conversa indisponível. Os dados exibidos podem estar desatualizados. A gravação continua.')} <button type="button" id="nexaRadarRetry">Tentar novamente</button></p>`:'');
      const visible=api.expanded?state.items:state.items.slice(0,5);updateRows(visible);
      if(!state.items.length)setHtml('radarQuestions',`<p class="ng-muted">${!state.hasContext?'Aguardando informações clínicas.':state.error||stale?'Análise incompleta; não é possível afirmar ausência de lacunas.':'Sem lacunas clínicas relevantes identificadas no momento.'}</p>`);else delete q('radarQuestions').dataset.rendered;
      q('nexaRadarMore').hidden=state.items.length<=5;setText('nexaRadarMore',api.expanded?'Mostrar menos':`Ver outras ${state.items.length-5} sugestões`);
      setText('ngClarifiedTitle',`✓ Esclarecidas (${clarified.length})`);
      setHtml('ngClarified',clarified.length?clarified.map(i=>`<details class="ng-evidence-row"><summary><span>${esc(i.label)}</span><span>${i.state==='known_absent'?'Negado':'Informado'}${i.temporal==='resolved'?' · resolvido':i.temporal==='prior'?' · prévio':''}${state.alerts.some(a=>a.concept===i.id)?' · Alerta':''}</span></summary>${evidenceHtml(i.evidence)}</details>`).join(''):'<p class="ng-muted">Os esclarecimentos aparecerão conforme a conversa evolui.</p>');
      setText('ngConfirmTitle',`A confirmar (${confirm.length})`);
      setHtml('ngConfirm',confirm.length?confirm.map(i=>`<div class="ng-confirm-row"><button type="button" data-question="${esc(i.id)}">${esc(E.concepts[i.concept].label)}</button><span>${i.category==='contradiction'?'Informações conflitantes.':'Resposta ambígua ou não compreendida.'}</span></div>`).join(''):'<p class="ng-muted">Nenhum ponto a confirmar identificado.</p>');
      setHtml('ngFindings',state.alerts.length?state.alerts.map(a=>`<article class="ng-finding"><span class="ng-priority">Achado identificado</span><h4>${esc(E.concepts[a.concept].label)}</h4>${evidenceHtml(a.evidence)}<p>${esc(a.reason)}</p><button type="button" data-tab="questions">Ver perguntas relacionadas</button></article>`).join(''):`<p class="ng-muted">${!state.hasContext||stale||state.error?'Dados insuficientes ou análise indisponível para avaliar alertas.':'Nenhum achado de alerta identificado nos dados disponíveis. Isso não determina o destino.'}</p>`);
      const gaps=state.items.filter(i=>i.redFlag||i.priority==='critical'||i.status==='confirm');
      setHtml('ngRiskGaps',gaps.length?`<div class="ng-risk-gaps"><h4>Ainda precisa ser esclarecido</h4>${gaps.slice(0,5).map(i=>`<div>${esc(E.concepts[i.concept].label)} <small>${states[i.status]||states.to_ask}</small></div>`).join('')}<button type="button" data-tab="questions">Ver perguntas relacionadas →</button></div>`:'');
      disposition(state);
    }
    api.subscribe(render);
    card.addEventListener('click',event=>{
      const btn=event.target.closest('button');if(!btn)return;
      if(btn.id==='ngQuestionsTab'||btn.id==='ngRisksTab')return selectTab(btn.id==='ngQuestionsTab'?'questions':'risks');
      if(btn.dataset.tab)return selectTab(btn.dataset.tab);
      if(btn.dataset.question){selectTab('questions');if(!api.expanded)api.toggle();card.querySelector(`[data-item="${btn.dataset.question}"]`)?.scrollIntoView({block:'nearest'});return;}
      if(btn.id==='nexaRadarMore')return api.toggle();if(btn.id==='nexaRadarRetry'){adapter.retryTranscript?.();return api.analyzeRemote();}
      const row=btn.closest('[data-item]');if(!row)return;
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
  root.NexaRadarController={create,mount,createTranscriptBuffer};
})(globalThis);
