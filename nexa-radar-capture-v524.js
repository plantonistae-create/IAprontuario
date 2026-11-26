/* NEXA V5.24 (CANDIDATE, NOT DEPLOYED) — preservation of EVERY Radar suggestion that was published to the screen, with its origin, versions, the physician's response and any later correction.
 * Append-only capture records of kind `radar`, discriminated by payload.event:
 *   suggestion_displayed / suggestion_changed — a question, alert or confirm item first published (or whose text/reason/priority/origin/evidence changed)
 *   physician_response — the physician's answer/acknowledgement (ledger entry), with `previous` and `is_correction` when it replaces an earlier one
 *   physician_response_undone — an undo; the retracted entry is kept in `previous`
 *   alert_status — pending/reviewed/… transitions of an alert, with the physician's reason
 * Nothing here is a label, a Core review or training data; the origin (`source`: rule / ai / evidence_library …) is kept so machine suggestions can never be mistaken for physician findings.
 * Idempotent across reloads: an event is marked as seen only AFTER the capture queue accepted it (so nothing is lost while capture is unconfigured, nothing is duplicated after a reload). */
(()=>{
'use strict';
if(window.nexaRadarCaptureV524)return;
const stable=v=>{if(Array.isArray(v))return'['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)};
const h=s=>{let x=5381;for(let i=0;i<s.length;i++)x=((x<<5)+x+s.charCodeAt(i))|0;return(x>>>0).toString(36)};   // short local dedupe key only (not a security digest)
const LISTS=['items','alerts','confirm'],clip=(v,n)=>String(v==null?'':v).slice(0,n);
function suggestionPayload(list,it,state,ctx){
  return{event:'suggestion_displayed',list,suggestion_id:clip(it.id,80),concept:clip(it.concept,80),category:clip(it.category||it.kind||'',60),priority:clip(it.priority,20),red_flag:it.redFlag===true,
    question:clip(it.question,400),reason:clip(it.reason,400),status:clip(it.status||'',30),target_section:clip(it.targetSection||'',40),answer_type:clip(it.answerType||'',20),
    source:clip(it.source||(list==='alerts'?it.kind:'')||'unreported',40),
    evidence:(Array.isArray(it.evidence)?it.evidence:[]).slice(0,4).map(e=>({quote:clip(e?.quote,240),section:clip(e?.section,50),state:clip(e?.state,30),temporal:clip(e?.temporal,30)})),
    related:(Array.isArray(it.related)?it.related:[]).slice(0,12).map(x=>clip(x,60)),
    radar_state_version:state.version??null,radar_meta:state.radarMeta&&typeof state.radarMeta==='object'?JSON.parse(JSON.stringify(state.radarMeta)):null,evidence_library_version:ctx.evidenceLibraryVersion||null,
    view_mode:ctx.viewMode||null,transcript_status:clip(state.transcriptStatus,20),displayed_at:ctx.at};
}
const suggestionKey=(list,it)=>'s|'+list+'|'+it.id+'|'+h(stable([it.question,it.reason,it.priority,it.source,it.evidenceKey||it.evidence,it.status]));
/** Pure: compares the published state with what is already recorded; returns [{key,payload}] in a deterministic order. `memory` = {entries:Map(ledger id->entry JSON), alerts:Map(id->status|reason), sugg:Map(list|id -> key)}. */
function diff(state,seen,memory,ctx){
  const out=[];if(!state||typeof state!=='object')return out;
  for(const list of LISTS)for(const it of Array.isArray(state[list])?state[list]:[]){
    if(!it||typeof it.id!=='string'||!it.id)continue;const key=suggestionKey(list,it);if(seen.has(key))continue;
    const slot=list+'|'+it.id,had=memory.sugg.get(slot),p=suggestionPayload(list,it,state,ctx);if(had&&had!==key)p.event='suggestion_changed';out.push({key,payload:p,commit:()=>memory.sugg.set(slot,key)});
  }
  const ledger=state.ledger&&typeof state.ledger==='object'?state.ledger:{};
  for(const id of Object.keys(ledger).sort()){
    const cur=ledger[id],js=stable(cur),prev=memory.entries.get(id);if(prev===js)continue;
    const key='r|'+id+'|'+h(js);if(seen.has(key)){memory.entries.set(id,js);continue}
    out.push({key,payload:{event:'physician_response',suggestion_id:clip(id,80),action:clip(cur?.action,30),value:clip(cur?.value,2000),section:clip(cur?.section,40),responded_at:clip(cur?.at,40),
      previous:prev?JSON.parse(prev):null,is_correction:!!prev,superseded:cur?.superseded?JSON.parse(JSON.stringify(cur.superseded)):null,evidence_key:clip(cur?.evidenceKey,300)},commit:()=>memory.entries.set(id,js)});
  }
  for(const [id,js] of [...memory.entries])if(!(id in ledger)){
    const key='u|'+id+'|'+h(js);if(seen.has(key)){memory.entries.delete(id);continue}
    out.push({key,payload:{event:'physician_response_undone',suggestion_id:clip(id,80),previous:JSON.parse(js),undone_at:ctx.at},commit:()=>memory.entries.delete(id)});
  }
  for(const a of Array.isArray(state.alertJournal)?state.alertJournal:[]){
    if(!a||typeof a.id!=='string')continue;const sig=clip(a.status,20)+'|'+clip(a.reason,300),key='a|'+a.id+'|'+h(sig),prev=memory.alerts.get(a.id);
    if(prev===sig||seen.has(key)){memory.alerts.set(a.id,sig);continue}
    if(prev===undefined&&a.status==='active'){memory.alerts.set(a.id,sig);continue}   // first appearance as active is already covered by suggestion_displayed
    out.push({key,payload:{event:'alert_status',suggestion_id:clip(a.id,80),status:clip(a.status,20),reason:clip(a.reason,300),previous_status:prev?prev.split('|')[0]:null,first_seen:clip(a.firstSeen,40),changed_at:ctx.at},commit:()=>memory.alerts.set(a.id,sig)});
  }
  return out;
}
function start({record,encounterId,viewMode=()=>document.body?.dataset?.nexaRadarViewMode||null,evidenceLibraryVersion=()=>window.nexaRadar?.snapshot?.()?.evidence_library_version||null,storage=window.localStorage,throttleMs=0}){
  if(typeof record!=='function'||typeof encounterId!=='function')throw new Error('RADAR_CAPTURE_CONFIG_INVALID');
  const mem=new Map(),loadSeen=enc=>{try{return new Set(JSON.parse(storage.getItem('nexa-radar-capture-seen:'+enc)||'[]'))}catch{return new Set}},saveSeen=(enc,s)=>{try{storage.setItem('nexa-radar-capture-seen:'+enc,JSON.stringify([...s].slice(-1500)))}catch{}};
  let chain=Promise.resolve();
  const clone=st=>{const o={};for(const k of ['version','radarMeta','items','alerts','confirm','ledger','alertJournal','transcriptStatus']){try{o[k]=st&&st[k]!==undefined?structuredClone(st[k]):undefined}catch{o[k]=undefined}}return o};
  // EVERY published state is processed in order from a clone taken at publication time: rapid sequences (answer -> undo -> answer) must not collapse into their final state.
  async function process(state){
    const enc=encounterId();if(!enc)return;
    if(!mem.has(enc)){if(mem.size>8)mem.delete(mem.keys().next().value);mem.set(enc,{memory:{entries:new Map(),alerts:new Map(),sugg:new Map()},seen:loadSeen(enc)})}
    const m=mem.get(enc),events=diff(state,m.seen,m.memory,{at:new Date().toISOString(),viewMode:viewMode(),evidenceLibraryVersion:evidenceLibraryVersion()});
    for(const e of events){let ok=false;try{ok=(await record('radar',e.payload,enc))===true}catch{}if(!ok)break;m.seen.add(e.key);e.commit();saveSeen(enc,m.seen)}
  }
  const handle=state=>{const snap=clone(state);chain=chain.then(()=>process(snap)).catch(()=>{});return chain};
  window.addEventListener('nexa:radar-state',e=>{void handle(e.detail?.state)});
  return{handle};
}
window.nexaRadarCaptureV524=Object.freeze({diff,start,mode:'candidate_not_deployed',trainingAuthorized:false});
})();
