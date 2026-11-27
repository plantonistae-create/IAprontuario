/* NEXA V5.24 (CANDIDATE, NOT DEPLOYED) — storage policy of the local encrypted audio vault: capture bitrate option, space preflight/alerts, and RETENTION.
 * RETENTION RULES (all enforced here, all tested):
 *  - OFF by default (APP_CONFIG.audioRetention.enabled=false): the applicable retention policy is a decision of the owner, not of the code.
 *  - NEVER purge audio without a CONFIRMED remote backup: a session is purge-eligible only if (1) the backup queue recorded state 'verified' for exactly that owner+session,
 *    (2) it was verified at least `days` (default 7) ago, (3) the vault session is FINALIZED, (4) it is not the open encounter, and (5) a FRESH remote re-confirmation
 *    (server manifest digest == the digest recorded at verification) succeeds right now. If the re-confirmation is unavailable or differs, the audio stays.
 *  - Only the current signed-in owner's own sessions are considered. Clinical records, histories and drafts are never touched: this module can only call vault.purge().
 * Capture bitrate: APP_CONFIG.audioBitsPerSecond (null = browser default, unchanged). Lab recommendation and its limits: labs/nexa-v524/V524-BITRATE-LAB.md. */
(()=>{
'use strict';
if(window.nexaAudioStorageV524)return;
const DEFAULT_BPS=128000,MB=1048576,DAY=86400000;
const num=v=>Number.isFinite(v)?v:null;
function recorderOptions(mime,cfg){
  const o=mime?{mimeType:mime}:{},bps=cfg&&cfg.audioBitsPerSecond;
  if(bps!==null&&bps!==undefined){if(!Number.isSafeInteger(bps)||bps<16000||bps>256000)throw new Error('AUDIO_BITRATE_INVALID');o.audioBitsPerSecond=bps}
  return o;
}
const needBytes=(bps,minutes)=>Math.max(64*MB,Math.round((bps||DEFAULT_BPS)/8*60*minutes*1.5));   // 1.5x safety; never less than 64 MB
/** level: ok | warn | block. Blocks ONLY when the browser reports a quota and the remaining space is smaller than a planned consultation needs. */
async function preflight({vault,bitsPerSecond=null,plannedMinutes=60}){
  let u={quota:null,usage:null,ratio:null,persisted:null};try{u=await vault.usage()}catch{}
  const quota=num(u.quota),used=num(u.usage),need=needBytes(bitsPerSecond,plannedMinutes);
  if(quota===null||used===null)return{level:'ok',freeBytes:null,neededBytes:need,ratio:null,persisted:u.persisted??null,message:null,unknownQuota:true};
  const free=Math.max(0,quota-used),ratio=used/quota,mb=n=>Math.round(n/MB);
  if(free<need)return{level:'block',freeBytes:free,neededBytes:need,ratio,persisted:u.persisted??null,message:`Espaço insuficiente neste aparelho para proteger o áudio (livre ≈ ${mb(free)} MB, necessário ≈ ${mb(need)} MB). Libere espaço no aparelho antes de gravar; nenhum áudio protegido foi apagado.`};
  if(ratio>=0.8||free<2*need)return{level:'warn',freeBytes:free,neededBytes:need,ratio,persisted:u.persisted??null,message:`Atenção: o armazenamento protegido deste aparelho está em ${Math.round(ratio*100)}% (livre ≈ ${mb(free)} MB). Libere espaço em breve.`};
  return{level:'ok',freeBytes:free,neededBytes:need,ratio,persisted:u.persisted??null,message:null};
}
/** called every few chunks while recording: only reports, never blocks or stops the recording. */
async function watch({vault,seq,onLow,every=6}){
  if(seq%every!==every-1)return null;
  const p=await preflight({vault,plannedMinutes:10});
  if(p.level!=='ok'&&typeof onLow==='function')onLow(p.level==='block'?'ATENÇÃO: espaço quase esgotado — o áudio pode deixar de ser protegido neste aparelho. Libere espaço.':p.message);
  return p;
}
/** @returns {{purged:object[], kept:object[]}} — never throws for one bad session; a failed confirmation KEEPS the audio. */
async function sweep({vault,queue,ownerId,policy,confirmRemote,now=Date.now(),activeEncounterId=null,onEvent}){
  const out={purged:[],kept:[]},keep=(s,reason)=>out.kept.push({sessionId:s,reason});
  if(!policy||policy.enabled!==true)return{...out,disabled:true};
  const days=Number.isInteger(policy.days)&&policy.days>=1?policy.days:7;
  if(typeof ownerId!=='string'||!ownerId)return{...out,disabled:true};
  const jobs=new Map((await queue.snapshot()).filter(j=>j.ownerId===ownerId).map(j=>[j.sessionId,j]));
  for(const row of await vault.listOwned(ownerId)){
    const job=jobs.get(row.sessionId);
    if(!row.finalized){keep(row.sessionId,'NOT_FINALIZED');continue}
    if(row.encounterId===activeEncounterId){keep(row.sessionId,'ACTIVE_ENCOUNTER');continue}
    if(!job||job.state!=='verified'||!job.digest||!Number.isFinite(job.verifiedAt)){keep(row.sessionId,'NO_VERIFIED_REMOTE_BACKUP');continue}
    if(now-job.verifiedAt<days*DAY){keep(row.sessionId,'WITHIN_RETENTION_WINDOW');continue}
    if(typeof confirmRemote!=='function'){keep(row.sessionId,'REMOTE_RECONFIRMATION_UNAVAILABLE');continue}
    let confirmed=false;try{confirmed=(await confirmRemote({ownerId,encounterId:row.encounterId,sessionId:row.sessionId,sourceVersion:job.sourceVersion||1},job.digest))===true}catch{}
    if(!confirmed){keep(row.sessionId,'REMOTE_RECONFIRMATION_FAILED');continue}
    try{const r=await vault.purge({ownerId,encounterId:row.encounterId,sessionId:row.sessionId,reason:'remote_verified'});out.purged.push({sessionId:row.sessionId,chunks:r.purgedChunks})}catch(e){keep(row.sessionId,'PURGE_REFUSED:'+String(e&&e.message||e).slice(0,40))}
  }
  try{onEvent&&onEvent(out)}catch{}
  return out;
}
window.nexaAudioStorageV524=Object.freeze({recorderOptions,needBytes,preflight,watch,sweep,mode:'candidate_not_deployed'});
})();
