/* NEXA v18.9.4 · stable Radar answered state + disposition summary · 2026-09-06 */
(()=>{
'use strict';
if(window.__NEXA_RADAR_STABLE_STATE_V18_9_4__)return;
window.__NEXA_RADAR_STABLE_STATE_V18_9_4__=true;

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().replace(/\s+/g,' ');
const key=v=>norm(v).toLowerCase().replace(/[^a-z0-9À-ÿ]+/gi,' ').trim();
let previousPending=new Map();
let answered=new Map();
let lastSignature='';
let expanded=false;

function radar(){try{return typeof radarState!=='undefined'&&radarState?radarState:(window.radarState||{})}catch{return window.radarState||{}}}
function list(name){const r=radar();return Array.isArray(r?.[name])?r[name]:[]}
function textOf(item){if(item==null)return'';if(typeof item==='string')return norm(item);if(typeof item==='object')return norm(item.question||item.label||item.text||item.title||item.name||item.key||item.field||'');return norm(item)}
function answerOf(item){if(!item||typeof item!=='object')return'';const v=item.answer??item.value??item.result??item.response??item.detail??item.resolved_value??item.resolution;return norm(v)}
function score(){const txt=$('#realtimeRadarCard')?.innerText||'';const m=txt.match(/(\d{1,3})\s*%/);return m?Math.max(0,Math.min(100,+m[1])):0}
function currentPending(){const out=new Map();for(const item of list('questions')){const t=textOf(item);if(t)out.set(key(t),{text:t,raw:item})}return out}
function coveredEntries(){const out=[];for(const item of list('covered')){const t=textOf(item);if(!t)continue;out.push({k:key(t),text:t,answer:answerOf(item),raw:item})}return out}
function missing(){return list('missing').map(textOf).filter(Boolean)}
function alerts(){return list('alerts').map(textOf).filter(Boolean)}
function matchCovered(question,covered){const qk=key(question);return covered.find(c=>c.k===qk||c.k.includes(qk)||qk.includes(c.k))||null}

function updateAnswered(){
  const now=currentPending(),covered=coveredEntries();
  for(const c of covered){if(!answered.has(c.k))answered.set(c.k,{text:c.text,answer:c.answer||'Esclarecido',at:Date.now()});else if(c.answer)answered.get(c.k).answer=c.answer}
  for(const [k,p] of previousPending){
    if(now.has(k)||answered.has(k))continue;
    const c=matchCovered(p.text,covered);
    answered.set(k,{text:p.text,answer:c?.answer||'Esclarecido durante a consulta',at:Date.now()});
  }
  previousPending=now;
}

function disposition(){
  const s=score(),a=alerts().length,m=missing().length,p=currentPending().size;
  let intern=Math.round(Math.min(75,a*22+Math.max(0,55-s)*.65+m*2));
  let reval=Math.round(Math.min(75,15+p*4+m*5+a*7+Math.max(0,70-s)*.25));
  let alta=Math.max(5,100-intern-reval);
  const total=alta+reval+intern||1;
  alta=Math.round(alta/total*100);reval=Math.round(reval/total*100);intern=100-alta-reval;
  let label='Em avaliação';
  if(a>0||intern>=35)label='Reavaliação / observação prioritária';
  else if(alta>=60&&s>=65)label='Alta provável';
  else if(reval>=alta)label='Reavaliação provável';
  else label='Alta possível';
  return{alta,reval,intern,label,score:s};
}

function style(){if($('#nexaRadarStableStyle194'))return;const s=document.createElement('style');s.id='nexaRadarStableStyle194';s.textContent=`
#nexaRadarStableDock{margin-top:12px;display:grid;gap:10px}
.nrs-card{border:1px solid var(--nf-line,var(--nexa-line,#dbe5ed));border-radius:12px;background:var(--nf-card2,var(--nexa-surface,#fff));padding:12px;color:var(--nf-text,var(--nexa-text,#0c2140))}
.nrs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.nrs-head strong{font-size:12px}.nrs-head small{font-size:9px;color:var(--nf-muted,var(--nexa-muted,#687d98))}
.nrs-pending-count{font-weight:900;color:var(--nf-orange,var(--nexa-warn,#ff961f))}.nrs-done-count{font-weight:900;color:var(--nf-ok,var(--nexa-ok,#12bb91))}
.nrs-done{display:grid;gap:6px}.nrs-done-row{display:grid;grid-template-columns:18px minmax(0,1fr);gap:7px;align-items:start;padding:7px 8px;border-radius:8px;background:color-mix(in srgb,var(--nf-ok,var(--nexa-ok,#12bb91)) 7%,transparent);font-size:10px}.nrs-check{color:var(--nf-ok,var(--nexa-ok,#12bb91));font-weight:950}.nrs-answer{display:block;margin-top:2px;color:var(--nf-muted,var(--nexa-muted,#687d98));font-size:9px}.nrs-toggle{border:0;background:transparent;color:var(--nf-teal,var(--nexa-brand,#00b7a4));font-weight:850;font-size:9px;padding:2px 0;cursor:pointer}
.nrs-disp-main{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.nrs-disp-label strong{display:block;font-size:14px}.nrs-disp-label small{display:block;color:var(--nf-muted,var(--nexa-muted,#687d98));font-size:8.5px;margin-top:2px}.nrs-bars{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.nrs-bar{border:1px solid var(--nf-line,var(--nexa-line,#dbe5ed));border-radius:9px;padding:8px;background:var(--nf-card,var(--nexa-surface,#fff));min-width:0}.nrs-bar span{display:block;font-size:8.5px;color:var(--nf-muted,var(--nexa-muted,#687d98));white-space:nowrap}.nrs-bar b{display:block;font-size:17px;margin-top:2px}.nrs-bar.alta b{color:var(--nf-ok,var(--nexa-ok,#12bb91))}.nrs-bar.reval b{color:var(--nf-orange,var(--nexa-warn,#ff961f))}.nrs-bar.intern b{color:var(--nf-red,var(--nexa-danger,#ff3150))}.nrs-note{font-size:8px;color:var(--nf-muted,var(--nexa-muted,#687d98));margin-top:8px;line-height:1.35}
@media(max-width:820px){#nexaRadarStableDock{margin-top:10px}.nrs-card{padding:10px}.nrs-bars{grid-template-columns:repeat(3,1fr)}.nrs-bar{padding:7px 5px;text-align:center}.nrs-bar span{white-space:normal}.nrs-bar b{font-size:15px}.nrs-disp-main{align-items:flex-start}}
`;document.head.appendChild(s)}

function ensureDock(){const radarCard=$('#realtimeRadarCard');if(!radarCard)return null;let d=$('#nexaRadarStableDock');if(!d){d=document.createElement('section');d.id='nexaRadarStableDock';radarCard.appendChild(d)}return d}
function render(){
  style();updateAnswered();const dock=ensureDock();if(!dock)return;
  const pend=currentPending(),disp=disposition(),done=[...answered.values()].sort((a,b)=>b.at-a.at);const visible=expanded?done:done.slice(0,4);
  const sig=JSON.stringify({p:[...pend.keys()],d:done.map(x=>[x.text,x.answer]),disp,expanded});if(sig===lastSignature)return;lastSignature=sig;
  dock.innerHTML=`<div class="nrs-card"><div class="nrs-head"><div><strong>Perguntas da sessão</strong><small> · estado persistente</small></div><div><span class="nrs-pending-count">${pend.size} pendente${pend.size===1?'':'s'}</span> · <span class="nrs-done-count">${done.length} esclarecida${done.length===1?'':'s'}</span></div></div>${done.length?`<div class="nrs-done">${visible.map(x=>`<div class="nrs-done-row"><span class="nrs-check">✓</span><span>${esc(x.text)}<span class="nrs-answer">${esc(x.answer||'Esclarecido')}</span></span></div>`).join('')}</div>${done.length>4?`<button class="nrs-toggle" id="nexaRadarAnsweredToggle">${expanded?'Mostrar menos':`Ver todas as ${done.length} esclarecidas`}</button>`:''}`:'<div class="nrs-answer">As perguntas respondidas permanecerão listadas aqui durante todo o atendimento.</div>'}</div><div class="nrs-card"><div class="nrs-head"><div><strong>Disposição do PS</strong><small> · tendência estável em tempo real</small></div><small>Radar ${disp.score}%</small></div><div class="nrs-disp-main"><div class="nrs-disp-label"><strong>${esc(disp.label)}</strong><small>Apoio à decisão; reavaliado conforme novas informações.</small></div></div><div class="nrs-bars"><div class="nrs-bar alta"><span>Compatibilidade com alta</span><b>${disp.alta}%</b></div><div class="nrs-bar reval"><span>Reavaliação / observação</span><b>${disp.reval}%</b></div><div class="nrs-bar intern"><span>Internação / encaminhamento</span><b>${disp.intern}%</b></div></div><div class="nrs-note">Percentuais representam um índice heurístico de compatibilidade calculado a partir da cobertura, pendências e alertas do Radar; não são probabilidades clínicas calibradas e não substituem julgamento médico, reavaliação ou protocolos.</div></div>`;
  $('#nexaRadarAnsweredToggle')?.addEventListener('click',()=>{expanded=!expanded;lastSignature='';render()},{once:true});
}
function reset(){previousPending.clear();answered.clear();expanded=false;lastSignature='';render()}
function onAction(e){const el=e.target?.closest?.('button,a,[role="button"]');if(!el)return;const text=norm(el.textContent).toLowerCase();if(el.id==='resetBtn'||el.id==='nexaTopReset'||el.id==='nexaRadarClearProxy'||/limpar consulta|novo atendimento/.test(text)){setTimeout(reset,80);return}if(el.id==='processBtn'||el.id==='nexaRadarProcessProxy'||/transcrever|finalizar|encerrar grava/.test(text))setTimeout(render,250)}
function boot(){style();render();document.addEventListener('click',onAction,true);document.addEventListener('input',()=>setTimeout(render,200),true);window.addEventListener('pageshow',()=>setTimeout(render,120));window.addEventListener('focus',()=>setTimeout(render,120));setInterval(()=>{if(!document.hidden&&$('#realtimeRadarCard'))render()},2500);window.nexaRadarStableRefresh194=render;window.nexaRadarStableReset194=reset}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();