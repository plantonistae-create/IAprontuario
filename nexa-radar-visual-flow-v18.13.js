/* NEXA v18.13.0 · Radar visual flow
 * Presentation/integration layer only:
 * - reuses the existing Radar state and question ordering;
 * - mirrors the existing recording timer without creating another clock;
 * - proxies the existing pause/finish/process actions;
 * - coordinates navigation from recording -> Radar -> structure -> review.
 */
(()=>{
'use strict';
if(window.__NEXA_RADAR_VISUAL_FLOW_V18_13__)return;
window.__NEXA_RADAR_VISUAL_FLOW_V18_13__=true;

const $=id=>document.getElementById(id);
const q=(selector,root=document)=>root.querySelector(selector);
const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const fmt=seconds=>`${String(Math.floor(Math.max(0,Number(seconds)||0)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,Number(seconds)||0)%60)).padStart(2,'0')}`;

let mounted=false;
let radarObject=null;
let lastQuestionKeys=null;
let lastRecorderActive=false;
let finalizedSeconds=0;
let recorderObserver=null;

function addStyle(){
  if($('nexaRadarVisualFlowStyle18130'))return;
  const style=document.createElement('style');
  style.id='nexaRadarVisualFlowStyle18130';
  style.textContent=`
  body[data-nexa-radar-visual-flow="1"] #realtimeRadarCard{
    scroll-margin-top:88px!important;
    overflow:visible!important;
  }
  body[data-nexa-radar-visual-flow="1"] #realtimeRadarCard>#nfRadarHead,
  body[data-nexa-radar-visual-flow="1"] #realtimeRadarCard>#nexaContextualStatus,
  body[data-nexa-radar-visual-flow="1"] #nexaAutoStatus{
    display:none!important;
  }
  body[data-nexa-radar-visual-flow="1"] [data-nexa-radar-redundant="1"]{
    display:none!important;
  }

  #nexaRadarOpsHeader18130{
    display:flex;align-items:center;justify-content:space-between;gap:14px;
    margin:0 0 12px;padding:12px 13px;
    border:1px solid var(--nf-line,var(--nexa-line,#dce6ec));
    border-radius:14px;background:var(--nf-card,var(--nexa-surface,#fff));
  }
  .nexa-radar-ops-title{min-width:0}
  .nexa-radar-ops-title strong{
    display:flex;align-items:center;gap:6px;flex-wrap:wrap;
    color:var(--nf-text,var(--nexa-text,#15314a));font-size:15px;letter-spacing:.01em
  }
  #nexaRadarLiveSuffix18130{color:#0a7c72;font-size:11px;font-weight:900}
  .nexa-radar-ops-title span{
    display:block;margin-top:3px;color:var(--nf-muted,var(--nexa-muted,#687c8f));font-size:10px
  }
  .nexa-radar-ops-controls{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
  #nexaRadarRecordingBadge18130{
    display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 11px;
    border:1px solid #e0e7ec;border-radius:10px;background:#f8fafb;
    color:#536575;font-size:10px;font-weight:900;white-space:nowrap
  }
  #nexaRadarRecordingBadge18130 .nexa-radar-rec-dot{
    width:8px;height:8px;border-radius:50%;background:#98a7b2;flex:0 0 auto
  }
  #nexaRadarRecordingBadge18130[data-state="recording"]{
    color:#c82537;border-color:#f0c9cf;background:#fff5f6
  }
  #nexaRadarRecordingBadge18130[data-state="recording"] .nexa-radar-rec-dot{background:#ee2f45}
  #nexaRadarRecordingBadge18130[data-state="paused"]{
    color:#9a6506;border-color:#ecd7ae;background:#fffaf0
  }
  #nexaRadarRecordingBadge18130[data-state="paused"] .nexa-radar-rec-dot{background:#d99212}
  #nexaRadarRecordingBadge18130[data-state="completed"]{
    color:#087760;border-color:#bfe2d8;background:#f1fbf7
  }
  #nexaRadarRecordingBadge18130[data-state="completed"] .nexa-radar-rec-dot{background:#10a37f}
  #nexaRadarRecordingBadge18130[data-state="processing"]{
    color:#176da8;border-color:#c9deed;background:#f2f8fc
  }
  #nexaRadarRecordingBadge18130[data-state="processing"] .nexa-radar-rec-dot{background:#2687c5}
  #nexaRadarRecordingBadge18130 strong{font-variant-numeric:tabular-nums;font-size:11px}
  .nexa-radar-rec-control{
    min-height:42px!important;padding:0 13px!important;border-radius:10px!important;
    border:1px solid var(--nf-line,var(--nexa-line,#dce6ec))!important;
    background:var(--nf-card,var(--nexa-surface,#fff))!important;
    color:var(--nf-text,var(--nexa-text,#15314a))!important;
    font-size:10px!important;font-weight:900!important;cursor:pointer
  }
  .nexa-radar-rec-control.finish{
    color:#c52536!important;border-color:#efc4ca!important;background:#fff7f8!important
  }
  .nexa-radar-rec-control:disabled{opacity:.45;cursor:not-allowed}
  .nexa-radar-rec-control:focus-visible,
  #nexaRadarVisualFlow18130 button:focus-visible{
    outline:2px solid #1976b8!important;outline-offset:2px!important
  }

  #nexaRadarOverview18130{
    display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(210px,1.25fr);
    gap:9px;margin:0 0 10px
  }
  .nexa-radar-metric18130,.nexa-radar-coverage18130{
    min-width:0;border:1px solid var(--nf-line,var(--nexa-line,#dce6ec));
    border-radius:13px;padding:11px 12px;background:var(--nf-card2,var(--nexa-surface-2,#f7fafb))
  }
  .nexa-radar-metric18130{display:flex;align-items:center;gap:10px}
  .nexa-radar-metric-icon18130{
    width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
    flex:0 0 30px;font-size:13px;font-weight:950
  }
  .nexa-radar-metric18130 strong{display:block;font-size:19px;line-height:1;color:var(--nf-text,var(--nexa-text,#15314a))}
  .nexa-radar-metric18130 span{display:block;margin-top:3px;font-size:9px;color:var(--nf-muted,var(--nexa-muted,#687c8f));line-height:1.25}
  .nexa-radar-metric18130.attention{background:#fff7f8;border-color:#f0d6da}
  .nexa-radar-metric18130.attention .nexa-radar-metric-icon18130{background:#ffe8eb;color:#cc2438}
  .nexa-radar-metric18130.pending{background:#fffaf2;border-color:#eedfc3}
  .nexa-radar-metric18130.pending .nexa-radar-metric-icon18130{background:#fff0ce;color:#ad7000}
  .nexa-radar-metric18130.covered{background:#f4fbf8;border-color:#d2e9df}
  .nexa-radar-metric18130.covered .nexa-radar-metric-icon18130{background:#dff5ec;color:#0a7b61}
  .nexa-radar-coverage18130{display:grid;align-content:center;gap:7px}
  .nexa-radar-coverage-head18130{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .nexa-radar-coverage-head18130 span{font-size:9px;color:var(--nf-muted,var(--nexa-muted,#687c8f));font-weight:800}
  .nexa-radar-coverage-head18130 strong{font-size:15px;color:var(--nf-text,var(--nexa-text,#15314a))}
  .nexa-radar-progress18130{
    height:7px;border-radius:99px;background:#e7edf1;overflow:hidden
  }
  #nexaRadarCoverageBar18130{
    height:100%;width:0;border-radius:inherit;background:#12a97f;transition:width .22s ease
  }
  .nexa-radar-coverage18130 small{font-size:8.5px;color:var(--nf-muted,var(--nexa-muted,#687c8f))}

  #nexaRadarVisualGrid18130{
    display:grid;grid-template-columns:minmax(150px,.82fr) minmax(160px,.9fr) minmax(310px,1.7fr) minmax(150px,.82fr);
    gap:9px;align-items:stretch;margin:0 0 10px
  }
  .nexa-radar-visual-panel18130{
    min-width:0;border:1px solid var(--nf-line,var(--nexa-line,#dce6ec));
    border-radius:13px;padding:11px;background:var(--nf-card,var(--nexa-surface,#fff))
  }
  .nexa-radar-visual-panel18130 h4{
    display:flex;align-items:center;justify-content:space-between;gap:7px;
    margin:0 0 8px!important;font-size:10px!important;text-transform:uppercase;letter-spacing:.035em
  }
  .nexa-radar-visual-panel18130 h4 b{
    display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:99px;
    font-size:9px;background:rgba(0,0,0,.045)
  }
  .nexa-radar-visual-panel18130.attention{background:#fffafb;border-color:#efdadd}
  .nexa-radar-visual-panel18130.attention h4{color:#be2638!important}
  .nexa-radar-visual-panel18130.pending{background:#fffcf7;border-color:#eee0c5}
  .nexa-radar-visual-panel18130.pending h4{color:#a96900!important}
  .nexa-radar-visual-panel18130.covered{background:#f8fcfa;border-color:#d9eae3}
  .nexa-radar-visual-panel18130.covered h4{color:#08755d!important}
  .nexa-radar-visual-panel18130.questions{
    background:#f8fbff;border-color:#cfdfee;padding:12px
  }
  .nexa-radar-visual-panel18130.questions h4{color:#1769a4!important;margin-bottom:2px!important}
  .nexa-radar-questions-heading18130{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px}
  .nexa-radar-questions-heading18130 p{margin:3px 0 0!important;font-size:9px!important;color:var(--nf-muted,var(--nexa-muted,#687c8f))}
  #nexaRadarUpdated18130{font-size:8.5px;color:#39779f;font-weight:850;white-space:nowrap;background:#edf6fd;padding:4px 6px;border-radius:99px}

  .nexa-radar-summary-list18130{display:grid;gap:6px}
  .nexa-radar-summary-item18130{
    display:flex;gap:7px;align-items:flex-start;padding:7px 7px;border:1px solid rgba(0,0,0,.045);
    border-radius:9px;background:rgba(255,255,255,.68);font-size:9.5px;line-height:1.35;
    color:var(--nf-text,var(--nexa-text,#15314a))
  }
  .nexa-radar-summary-item18130 i{font-style:normal;font-weight:950;line-height:1.25}
  .attention .nexa-radar-summary-item18130 i{color:#c8293c}
  .pending .nexa-radar-summary-item18130 i{color:#b17100}
  .covered .nexa-radar-summary-item18130 i{color:#0a7b61}
  .nexa-radar-empty18130{font-size:9px;color:var(--nf-muted,var(--nexa-muted,#687c8f));line-height:1.4}
  .nexa-radar-more18130{font-size:8px;color:var(--nf-muted,var(--nexa-muted,#687c8f));margin-top:6px}

  #nexaRadarNextBestHost18130>#nexaNextBest{
    margin:0 0 8px!important;border:1px solid #d6e6f2!important;background:#fff!important;
    border-radius:10px!important;padding:10px!important
  }
  #nexaRadarNextBestHost18130>#nexaNextBest .nexa-next-kicker{font-size:8px!important;color:#1769a4!important}
  #nexaRadarNextBestHost18130>#nexaNextBest h3{font-size:14px!important;line-height:1.35!important;margin:5px 0!important}
  #nexaRadarNextBestHost18130>#nexaNextBest p{font-size:9px!important;line-height:1.4!important;margin:4px 0!important}
  .nexa-radar-question-groups18130{display:grid;gap:8px}
  .nexa-radar-question-group18130{display:grid;gap:5px}
  .nexa-radar-question-group-title18130{
    font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:var(--nf-muted,var(--nexa-muted,#687c8f))
  }
  .nexa-radar-question-link18130{
    width:100%;min-height:40px!important;display:grid!important;grid-template-columns:18px minmax(0,1fr) auto!important;
    align-items:center!important;gap:7px!important;text-align:left!important;padding:7px 8px!important;
    border:1px solid #dce7f0!important;border-radius:9px!important;background:#fff!important;
    color:var(--nf-text,var(--nexa-text,#15314a))!important;font-size:9.5px!important;line-height:1.3!important
  }
  .nexa-radar-question-link18130:hover{border-color:#91bddb!important;background:#f5faff!important}
  .nexa-radar-question-link18130 .qmark{
    width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#e9f4fc;color:#1972ad;font-size:10px;font-weight:950
  }
  .nexa-radar-question-link18130 .qpriority{
    font-size:7.5px;font-weight:900;color:#607687;border-radius:99px;background:#f0f4f7;padding:3px 5px;white-space:nowrap
  }
  .nexa-radar-question-link18130[data-priority="critical"]{border-color:#efc9d0!important;background:#fffafb!important}
  .nexa-radar-question-link18130[data-priority="critical"] .qpriority{color:#b52239;background:#fdecef}
  .nexa-radar-question-link18130[data-priority="high"] .qpriority{color:#176ba4;background:#eaf5fc}
  @keyframes nexaRadarFresh18130{
    0%{box-shadow:0 0 0 0 rgba(38,133,195,.25)}
    55%{box-shadow:0 0 0 5px rgba(38,133,195,.08)}
    100%{box-shadow:0 0 0 0 rgba(38,133,195,0)}
  }
  .nexa-radar-question-link18130.is-fresh{animation:nexaRadarFresh18130 .82s ease-out 1}

  #nexaRadarPost18130{
    display:none;position:sticky;bottom:max(10px,env(safe-area-inset-bottom));z-index:30;
    align-items:center;gap:10px;margin:10px 0 0;padding:10px 11px;
    border:1px solid #bfe2d8;border-radius:12px;background:rgba(244,252,249,.96);
    backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(22,62,70,.08)
  }
  #nexaRadarPost18130.on{display:flex}
  #nexaRadarPost18130 .post-copy{min-width:0;flex:1}
  #nexaRadarPost18130 .post-copy strong{display:block;font-size:10px;color:#08755d}
  #nexaRadarPost18130 .post-copy span{display:block;font-size:8.5px;color:var(--nf-muted,var(--nexa-muted,#687c8f));margin-top:2px}
  #nexaRadarPostAction18130{
    min-height:42px!important;border:1px solid #1976b8!important;border-radius:9px!important;
    background:#1976b8!important;color:#fff!important;font-size:9.5px!important;font-weight:900!important;padding:0 12px!important
  }

  body[data-nexa-radar-visual-flow="1"] #nexaAutoRadarWorkspace{
    grid-template-columns:minmax(0,1fr)!important;margin-top:8px!important
  }
  body[data-nexa-radar-visual-flow="1"] #nexaAutoRadarWorkspace>.ng-side{
    display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important
  }
  body[data-nexa-radar-visual-flow="1"] #nexaAutoRadarWorkspace>.ng-side>p{grid-column:1/-1}
  body[data-nexa-radar-visual-flow="1"] #nexaRadarFullDetails{margin-top:8px}
  body[data-nexa-radar-visual-flow="1"] #nexaAutoVitals{margin-bottom:0}

  @media(max-width:1080px){
    #nexaRadarOverview18130{grid-template-columns:repeat(3,minmax(0,1fr));}
    .nexa-radar-coverage18130{grid-column:1/-1}
    #nexaRadarVisualGrid18130{grid-template-columns:minmax(140px,.8fr) minmax(150px,.9fr) minmax(280px,1.6fr)}
    #nexaRadarVisualCovered18130{grid-column:1/-1}
  }
  @media(max-width:820px){
    body[data-nexa-radar-visual-flow="1"] #realtimeRadarCard{scroll-margin-top:74px!important}
    #nexaRadarOpsHeader18130{align-items:stretch;flex-direction:column;padding:11px}
    .nexa-radar-ops-controls{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    #nexaRadarRecordingBadge18130{grid-column:1/-1;justify-content:center}
    .nexa-radar-rec-control{width:100%}
    #nexaRadarOverview18130{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .nexa-radar-metric18130{display:block;text-align:center;padding:9px 5px}
    .nexa-radar-metric-icon18130{margin:0 auto 5px;width:27px;height:27px}
    .nexa-radar-metric18130 strong{font-size:16px}
    .nexa-radar-metric18130 span{font-size:7.5px}
    .nexa-radar-coverage18130{grid-column:1/-1}
    #nexaRadarVisualGrid18130{display:flex;flex-direction:column;gap:8px}
    #nexaRadarVisualQuestions18130{order:1}
    #nexaRadarVisualAttention18130{order:2}
    #nexaRadarVisualPending18130{order:3}
    #nexaRadarVisualCovered18130{order:4}
    .nexa-radar-visual-panel18130{width:100%}
    body[data-nexa-radar-visual-flow="1"] #nexaAutoRadarWorkspace>.ng-side{grid-template-columns:1fr!important}
    #nexaRadarPost18130{bottom:max(78px,calc(66px + env(safe-area-inset-bottom)))}
  }
  @media(max-width:420px){
    #nexaRadarOverview18130{grid-template-columns:repeat(3,minmax(0,1fr))}
    .nexa-radar-metric18130 span{min-height:19px}
    .nexa-radar-question-link18130{grid-template-columns:18px minmax(0,1fr)!important}
    .nexa-radar-question-link18130 .qpriority{grid-column:2;justify-self:start}
    #nexaRadarPost18130{align-items:stretch;flex-direction:column}
    #nexaRadarPostAction18130{width:100%}
  }
  `;
  document.head.appendChild(style);
}

function conceptLabel(id){
  return window.NexaRadarEngine?.concepts?.[id]?.label||String(id||'').trim();
}

function currentState(){
  const modern=window.nexaRadar?.state;
  if(modern&&Array.isArray(modern.items)){
    return{kind:'modern',raw:modern};
  }
  const legacy=window.radarState&&typeof window.radarState==='object'?window.radarState:{};
  return{kind:'legacy',raw:legacy};
}

function derive(source=currentState()){
  const state=source.raw||{};
  if(source.kind==='modern'){
    const alerts=Array.isArray(state.alerts)?state.alerts:[];
    const items=Array.isArray(state.items)?state.items:[];
    const clarified=Array.isArray(state.clarified)?state.clarified:[];
    const attention=alerts.map(a=>conceptLabel(a?.concept)||a?.label||a?.reason).filter(Boolean);
    const pending=items.map(i=>conceptLabel(i?.concept)||i?.label||i?.question).filter(Boolean);
    const covered=clarified.map(i=>i?.label||conceptLabel(i?.concept)||i?.question).filter(Boolean);
    const denom=clarified.length+items.length;
    return{
      kind:'modern',state,
      attention,pending,covered,
      questions:items,
      attentionCount:alerts.length,
      pendingCount:items.length,
      coveredCount:clarified.length,
      coverage:denom?Math.max(0,Math.min(100,Math.round((clarified.length/denom)*100))):null
    };
  }
  const attention=Array.isArray(state.alerts)?state.alerts.map(String):[];
  const pending=Array.isArray(state.missing)?state.missing.map(String):[];
  const covered=Array.isArray(state.covered)?state.covered.map(String):[];
  const questions=Array.isArray(state.questions)?state.questions.map(String):[];
  const denom=covered.length+pending.length;
  return{
    kind:'legacy',state,
    attention,pending,covered,questions,
    attentionCount:attention.length,pendingCount:pending.length,coveredCount:covered.length,
    coverage:denom?Math.max(0,Math.min(100,Math.round((covered.length/denom)*100))):null
  };
}

function recorderSnapshot(){
  let helper=null;
  try{helper=window.nexaRecordingTimerState198?.()||null}catch{}
  const rec=$('recBtn'),process=$('processBtn'),status=String($('status')?.textContent||'');
  const state=String(rec?.dataset.recordingState||'');
  const active=helper?.active??(state==='recording'||state==='paused'||!!rec?.classList.contains('recording'));
  const paused=helper?.paused??(state==='paused');
  const blob=helper?.blob??(!active&&!!process&&!process.disabled&&/gravação concluída|pronta para transcrever/i.test(status));
  const processing=document.body.dataset.nexaProcessing==='1'||document.body.dataset.nexaClinicalPhase==='processing';
  const timer=String($('timer')?.textContent||'00:00').trim()||'00:00';
  return{active,paused,blob,processing,timer,state};
}

function clickExisting(ids){
  for(const id of ids){
    const el=$(id);
    if(el&&!el.disabled){
      el.click();
      return true;
    }
  }
  return false;
}

function sourceProcessButton(){
  const candidates=[$('nfProcess'),$('nfTopProcess'),$('processBtn')].filter(Boolean);
  return candidates.find(el=>!el.disabled&&el.getClientRects?.().length&&getComputedStyle(el).visibility!=='hidden')
    ||candidates.find(el=>!el.disabled)
    ||null;
}

function stickyOffset(){
  return innerWidth<=820?82:88;
}
function comfortablyVisible(el){
  if(!el||!el.getClientRects?.().length)return false;
  const r=el.getBoundingClientRect(),top=stickyOffset();
  return r.top>=top&&r.bottom<=innerHeight-18;
}
function scrollComfortably(el,block='start'){
  if(!el||!el.getClientRects?.().length||comfortablyVisible(el))return false;
  if(block==='center'){
    el.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
    return true;
  }
  const r=el.getBoundingClientRect();
  window.scrollTo({top:Math.max(0,window.scrollY+r.top-stickyOffset()),left:0,behavior:'smooth'});
  return true;
}
function ensureRadarVisible(){
  const card=$('realtimeRadarCard');
  if(!card)return null;
  if(!card.getClientRects?.().length){
    const nav=q('#nfShell [data-go="radar"],[data-stage-target="radar"],.nexa-session-tab[data-stage="radar"]');
    nav?.click();
  }
  return card;
}

function summaryHtml(items,tone){
  if(!items.length)return'<div class="nexa-radar-empty18130">Nenhum item identificado neste grupo no momento.</div>';
  const visible=items.slice(0,4);
  return`<div class="nexa-radar-summary-list18130">${visible.map(item=>`<div class="nexa-radar-summary-item18130"><i>${tone==='covered'?'✓':tone==='attention'?'!':'•'}</i><span>${esc(item)}</span></div>`).join('')}</div>${items.length>visible.length?`<div class="nexa-radar-more18130">+${items.length-visible.length} item(ns)</div>`:''}`;
}

function priorityText(priority,status){
  if(status==='confirm')return'A confirmar';
  if(priority==='critical')return'Essencial agora';
  if(priority==='high')return'Importante';
  if(priority==='moderate'||priority==='low')return'Complementar';
  return'';
}

function questionKey(item,index,kind){
  if(kind==='modern')return String(item?.id||item?.concept||item?.question||index);
  return norm(item)||String(index);
}

function openOriginalQuestion(id){
  if(!id)return;
  const details=$('nexaRadarFullDetails');
  if(details)details.open=true;
  const tab=$('ngQuestionsTab');
  if(tab&&tab.getAttribute('aria-selected')!=='true')tab.click();
  let row=qa('#radarQuestions [data-item]').find(el=>String(el.dataset.item)===String(id));
  if(!row&&$('nexaRadarMore')&&!$('nexaRadarMore').hidden){
    $('nexaRadarMore').click();
    row=qa('#radarQuestions [data-item]').find(el=>String(el.dataset.item)===String(id));
  }
  if(row){
    row.tabIndex=-1;
    row.focus({preventScroll:true});
    row.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
  }else{
    $('radarQuestions')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}

function renderQuestions(model,newKeys=[]){
  const host=$('nexaRadarQuestionGroups18130');
  if(!host)return;
  const items=model.questions||[];
  if(!items.length){
    host.innerHTML='<div class="nexa-radar-empty18130">As sugestões aparecerão conforme o Radar identificar lacunas relevantes.</div>';
    return;
  }
  if(model.kind==='modern'){
    const heroExists=!!$('nexaNextBest')&&$('nexaNextBest').parentElement===$('nexaRadarNextBestHost18130');
    const list=heroExists?items.slice(1,6):items.slice(0,5);
    const priority=list.filter(i=>i?.priority==='critical'||i?.priority==='high');
    const complementary=list.filter(i=>!priority.includes(i));
    const row=i=>{
      const key=questionKey(i,items.indexOf(i),model.kind),label=priorityText(i?.priority,i?.status);
      return`<button type="button" class="nexa-radar-question-link18130${newKeys.includes(key)?' is-fresh':''}" data-question-ref="${esc(i?.id||'')}" data-question-key="${esc(key)}" data-priority="${esc(i?.priority||'')}"><span class="qmark">?</span><span>${esc(i?.question||conceptLabel(i?.concept)||'Pergunta sugerida')}</span>${label?`<span class="qpriority">${esc(label)}</span>`:''}</button>`;
    };
    const groups=[];
    if(priority.length)groups.push(`<div class="nexa-radar-question-group18130"><div class="nexa-radar-question-group-title18130">Perguntas prioritárias</div>${priority.map(row).join('')}</div>`);
    if(complementary.length)groups.push(`<div class="nexa-radar-question-group18130"><div class="nexa-radar-question-group-title18130">${priority.length?'Perguntas complementares':'Próximas perguntas'}</div>${complementary.map(row).join('')}</div>`);
    host.innerHTML=groups.join('');
  }else{
    host.innerHTML=`<div class="nexa-radar-question-group18130">${items.slice(0,5).map((text,index)=>{
      const key=questionKey(text,index,model.kind);
      return`<button type="button" class="nexa-radar-question-link18130${newKeys.includes(key)?' is-fresh':''}" data-question-key="${esc(key)}"><span class="qmark">?</span><span>${esc(text)}</span></button>`;
    }).join('')}</div>`;
  }
  qa('.nexa-radar-question-link18130',host).forEach(button=>{
    button.addEventListener('click',()=>openOriginalQuestion(button.dataset.questionRef||''));
    button.addEventListener('animationend',()=>button.classList.remove('is-fresh'),{once:true});
  });
}

function integrateExistingRadarPieces(){
  const questionHero=$('nexaRadarNextBestHost18130'),next=$('nexaNextBest');
  if(questionHero&&next&&next.parentElement!==questionHero)questionHero.appendChild(next);
  const priority=$('nexaPriorityList')?.closest('.nexa-auto-card');
  if(priority)priority.dataset.nexaRadarRedundant='1';
}

function ensureShell(){
  const card=$('realtimeRadarCard');
  if(!card)return false;
  document.body.dataset.nexaRadarVisualFlow='1';
  addStyle();

  let header=$('nexaRadarOpsHeader18130');
  if(!header||header.parentElement!==card){
    header=document.createElement('section');
    header.id='nexaRadarOpsHeader18130';
    header.setAttribute('aria-label','Controles do Radar durante a gravação');
    header.innerHTML=`
      <div class="nexa-radar-ops-title">
        <strong>RADAR CLÍNICO <span id="nexaRadarLiveSuffix18130"></span></strong>
        <span>Análise em tempo real da consulta</span>
      </div>
      <div class="nexa-radar-ops-controls">
        <span id="nexaRadarRecordingBadge18130" role="status" aria-live="polite" data-state="idle"><span class="nexa-radar-rec-dot"></span><span id="nexaRadarRecordingState18130">AGUARDANDO</span><strong id="nexaRadarRecordingTimer18130">00:00</strong></span>
        <button type="button" class="nexa-radar-rec-control" id="nexaRadarLivePause18130" aria-label="Pausar gravação">Ⅱ <span id="nexaRadarLivePauseText18130">Pausar</span></button>
        <button type="button" class="nexa-radar-rec-control finish" id="nexaRadarLiveFinish18130" aria-label="Encerrar gravação">■ Encerrar gravação</button>
      </div>`;
    card.prepend(header);
    $('nexaRadarLivePause18130').onclick=()=>clickExisting(['nexaLocalPauseBtn','nfPause','nexaPauseBtn','nexaDesktopPause','recBtn']);
    $('nexaRadarLiveFinish18130').onclick=()=>clickExisting(['nexaLocalFinishBtn','nfFinish','nexaFinishBtn','nexaDesktopFinish']);
  }

  let overview=$('nexaRadarOverview18130');
  if(!overview||overview.parentElement!==card){
    overview=document.createElement('section');
    overview.id='nexaRadarOverview18130';
    overview.setAttribute('aria-label','Resumo do estado da consulta');
    overview.innerHTML=`
      <div class="nexa-radar-metric18130 attention"><span class="nexa-radar-metric-icon18130" aria-hidden="true">!</span><div><strong id="nexaRadarAttentionCount18130">0</strong><span>pontos de atenção</span></div></div>
      <div class="nexa-radar-metric18130 pending"><span class="nexa-radar-metric-icon18130" aria-hidden="true">○</span><div><strong id="nexaRadarPendingCount18130">0</strong><span>informações pendentes</span></div></div>
      <div class="nexa-radar-metric18130 covered"><span class="nexa-radar-metric-icon18130" aria-hidden="true">✓</span><div><strong id="nexaRadarCoveredCount18130">0</strong><span>itens já cobertos</span></div></div>
      <div class="nexa-radar-coverage18130">
        <div class="nexa-radar-coverage-head18130"><span>Cobertura da consulta</span><strong id="nexaRadarCoverageText18130">—</strong></div>
        <div class="nexa-radar-progress18130" id="nexaRadarCoverageProgress18130" role="progressbar" aria-label="Cobertura dos contextos monitorados" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Sem dados suficientes"><div id="nexaRadarCoverageBar18130"></div></div>
        <small>Proporção dos contextos monitorados já abordados; não é score de qualidade médica.</small>
      </div>`;
    header.insertAdjacentElement('afterend',overview);
  }

  let grid=$('nexaRadarVisualGrid18130');
  if(!grid||grid.parentElement!==card){
    grid=document.createElement('section');
    grid.id='nexaRadarVisualGrid18130';
    grid.setAttribute('aria-label','Radar clínico em tempo real');
    grid.innerHTML=`
      <section class="nexa-radar-visual-panel18130 attention" id="nexaRadarVisualAttention18130"><h4><span>Pontos de atenção</span><b id="nexaRadarAttentionBadge18130">0</b></h4><div id="nexaRadarAttentionList18130"></div></section>
      <section class="nexa-radar-visual-panel18130 pending" id="nexaRadarVisualPending18130"><h4><span>A esclarecer</span><b id="nexaRadarPendingBadge18130">0</b></h4><div id="nexaRadarPendingList18130"></div></section>
      <section class="nexa-radar-visual-panel18130 questions" id="nexaRadarVisualQuestions18130">
        <div class="nexa-radar-questions-heading18130"><div><h4>Próximas perguntas sugeridas</h4><p>Sugestões em tempo real para conduzir a entrevista</p></div><span id="nexaRadarUpdated18130">Aguardando atualização</span></div>
        <div id="nexaRadarNextBestHost18130"></div>
        <div class="nexa-radar-question-groups18130" id="nexaRadarQuestionGroups18130"></div>
      </section>
      <section class="nexa-radar-visual-panel18130 covered" id="nexaRadarVisualCovered18130"><h4><span>Já coberto</span><b id="nexaRadarCoveredBadge18130">0</b></h4><div id="nexaRadarCoveredList18130"></div></section>`;
    overview.insertAdjacentElement('afterend',grid);
  }

  let post=$('nexaRadarPost18130');
  if(!post||post.parentElement!==card){
    post=document.createElement('section');
    post.id='nexaRadarPost18130';
    post.setAttribute('aria-live','polite');
    post.innerHTML=`<div class="post-copy"><strong id="nexaRadarPostTitle18130">✓ Gravação concluída</strong><span>Áudio pronto para a próxima etapa.</span></div><button type="button" id="nexaRadarPostAction18130">Transcrever e estruturar →</button>`;
    card.appendChild(post);
    $('nexaRadarPostAction18130').onclick=()=>{
      const source=sourceProcessButton();
      if(source)source.click();
    };
  }

  integrateExistingRadarPieces();
  mounted=true;
  return true;
}

function updateCoverage(model){
  const value=model.coverage;
  const text=$('nexaRadarCoverageText18130'),bar=$('nexaRadarCoverageBar18130'),progress=$('nexaRadarCoverageProgress18130');
  if(value===null||value===undefined){
    if(text)text.textContent='—';
    if(bar)bar.style.width='0%';
    if(progress){progress.removeAttribute('aria-valuenow');progress.setAttribute('aria-valuetext','Sem dados suficientes');}
    return;
  }
  if(text)text.textContent=value+'%';
  if(bar)bar.style.width=value+'%';
  if(progress){progress.setAttribute('aria-valuenow',String(value));progress.setAttribute('aria-valuetext',value+'% dos contextos monitorados abordados');}
}

function renderRadar(source=currentState()){
  if(!ensureShell())return;
  integrateExistingRadarPieces();
  const model=derive(source);
  if($('nexaRadarAttentionCount18130'))$('nexaRadarAttentionCount18130').textContent=String(model.attentionCount);
  if($('nexaRadarPendingCount18130'))$('nexaRadarPendingCount18130').textContent=String(model.pendingCount);
  if($('nexaRadarCoveredCount18130'))$('nexaRadarCoveredCount18130').textContent=String(model.coveredCount);
  if($('nexaRadarAttentionBadge18130'))$('nexaRadarAttentionBadge18130').textContent=String(model.attentionCount);
  if($('nexaRadarPendingBadge18130'))$('nexaRadarPendingBadge18130').textContent=String(model.pendingCount);
  if($('nexaRadarCoveredBadge18130'))$('nexaRadarCoveredBadge18130').textContent=String(model.coveredCount);
  if($('nexaRadarAttentionList18130'))$('nexaRadarAttentionList18130').innerHTML=summaryHtml(model.attention,'attention');
  if($('nexaRadarPendingList18130'))$('nexaRadarPendingList18130').innerHTML=summaryHtml(model.pending,'pending');
  if($('nexaRadarCoveredList18130'))$('nexaRadarCoveredList18130').innerHTML=summaryHtml(model.covered,'covered');
  updateCoverage(model);

  const keys=(model.questions||[]).map((item,index)=>questionKey(item,index,model.kind));
  const newKeys=lastQuestionKeys===null?[]:keys.filter(key=>!lastQuestionKeys.has(key));
  lastQuestionKeys=new Set(keys);
  renderQuestions(model,newKeys);
  const updated=$('nexaRadarUpdated18130');
  if(updated)updated.textContent=newKeys.length?'Atualizado agora':(keys.length?'Atualizado agora':'Aguardando atualização');
}

function updatePostVisibility(snapshot){
  const post=$('nexaRadarPost18130');
  if(!post)return;
  const show=!!snapshot.blob&&!snapshot.active&&!snapshot.processing;
  post.classList.toggle('on',show);
  const action=$('nexaRadarPostAction18130'),source=sourceProcessButton();
  if(action)action.disabled=!source;
  if(show){
    const duration=finalizedSeconds>0?fmt(finalizedSeconds):snapshot.timer;
    const title=$('nexaRadarPostTitle18130');
    if(title)title.textContent=`✓ Gravação concluída · ${duration}`;
  }
}

function updateRecorder(){
  if(!ensureShell())return;
  const snapshot=recorderSnapshot();
  const badge=$('nexaRadarRecordingBadge18130'),stateText=$('nexaRadarRecordingState18130'),timer=$('nexaRadarRecordingTimer18130');
  const pause=$('nexaRadarLivePause18130'),pauseText=$('nexaRadarLivePauseText18130'),finish=$('nexaRadarLiveFinish18130'),suffix=$('nexaRadarLiveSuffix18130');

  let state='idle',label='AGUARDANDO';
  if(snapshot.processing){state='processing';label='PROCESSANDO'}
  else if(snapshot.active&&snapshot.paused){state='paused';label='PAUSADO'}
  else if(snapshot.active){state='recording';label='GRAVANDO'}
  else if(snapshot.blob){state='completed';label='CONCLUÍDA'}

  if(badge)badge.dataset.state=state;
  if(stateText)stateText.textContent=label;
  if(timer)timer.textContent=snapshot.timer;
  if(suffix)suffix.textContent=snapshot.active?'· AO VIVO':snapshot.blob?'· GRAVAÇÃO CONCLUÍDA':'';
  if(pause){pause.disabled=!snapshot.active;pause.setAttribute('aria-label',snapshot.paused?'Retomar gravação':'Pausar gravação')}
  if(pauseText)pauseText.textContent=snapshot.paused?'Retomar':'Pausar';
  if(finish)finish.disabled=!snapshot.active;
  updatePostVisibility(snapshot);

  if(snapshot.active&&!lastRecorderActive){
    const card=ensureRadarVisible();
    requestAnimationFrame(()=>requestAnimationFrame(()=>scrollComfortably(card,'start')));
  }
  lastRecorderActive=!!snapshot.active;
}

function onFinalized(event){
  finalizedSeconds=Math.max(0,Number(event?.detail?.seconds)||0);
  updateRecorder();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const target=sourceProcessButton()||$('nexaRadarPost18130');
    scrollComfortably(target,'center');
  }));
}

function reviewTarget(){
  const candidates=[$('nexaReviewHeader'),$('nexaFlowHistory'),q('.nexa-flow-section:not([hidden])')].filter(Boolean);
  return candidates.find(el=>el.getClientRects?.().length)||candidates[0]||null;
}

function onClinicalProcessing(event){
  const state=event?.detail?.state;
  updateRecorder();
  if(state==='processing'){
    $('nexaRadarPost18130')?.classList.remove('on');
  }else if(state==='structured'){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      updateRecorder();
      scrollComfortably(reviewTarget(),'start');
    }));
  }else if(state==='error'){
    requestAnimationFrame(()=>updateRecorder());
  }
}

function observeRecorder(){
  if(recorderObserver)return;
  const rec=$('recBtn'),timer=$('timer'),process=$('processBtn'),status=$('status');
  if(!rec||!timer)return;
  recorderObserver=new MutationObserver(()=>updateRecorder());
  recorderObserver.observe(rec,{attributes:true,attributeFilter:['class','data-recording-state','disabled','aria-label']});
  recorderObserver.observe(timer,{childList:true,characterData:true,subtree:true});
  if(process)recorderObserver.observe(process,{attributes:true,attributeFilter:['disabled']});
  if(status)recorderObserver.observe(status,{childList:true,characterData:true,subtree:true});
}

function bindRadar(){
  if(window.nexaRadar&&window.nexaRadar!==radarObject){
    radarObject=window.nexaRadar;
    radarObject.subscribe?.(state=>renderRadar({kind:Array.isArray(state?.items)?'modern':'legacy',raw:state||{}}));
  }
}

function boot(){
  ensureShell();
  bindRadar();
  observeRecorder();
  renderRadar();
  updateRecorder();

  window.addEventListener('nexa:radar-state',event=>{
    bindRadar();
    const state=event?.detail?.state;
    renderRadar({kind:Array.isArray(state?.items)?'modern':'legacy',raw:state||{}});
  });
  window.addEventListener('nexa:recording-finalized',onFinalized);
  window.addEventListener('nexa:clinical-processing',onClinicalProcessing);
  window.addEventListener('nexa:consultation-reset',()=>{
    finalizedSeconds=0;lastQuestionKeys=null;lastRecorderActive=false;
    requestAnimationFrame(()=>{renderRadar();updateRecorder();});
  });
  window.addEventListener('nexa:continuous-soap-mounted',()=>requestAnimationFrame(()=>{ensureShell();integrateExistingRadarPieces();renderRadar();updateRecorder()}));

  const card=$('realtimeRadarCard');
  if(card){
    const directObserver=new MutationObserver(()=>{
      if(!$('nexaRadarOpsHeader18130')||$('nexaRadarOpsHeader18130')?.parentElement!==card){
        ensureShell();bindRadar();renderRadar();updateRecorder();
      }else integrateExistingRadarPieces();
    });
    directObserver.observe(card,{childList:true});
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.nexaRadarVisualFlow18130={
  render:renderRadar,
  syncRecorder:updateRecorder,
  derive,
  scrollToRadar:()=>scrollComfortably(ensureRadarVisible(),'start')
};
})();
