// NEXA minimal shadow lab. Offline, no provider call, no browser, no database.
// A human must review deidentification BEFORE importing clinical material.
// This contract is a laboratory adapter, not a live consultation decision.
import Engine from '../nexa-radar-engine.js';
import {inferRadarLocally} from '../services/nexa-core-radar/infer.mjs';
import {createCoreRadarRequest} from '../supabase/functions/_shared/nexa-core-radar-adapter.mjs';
import {performance} from 'node:perf_hooks';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const LAB_CONTRACT='nexa-shadow-lab-v1';
const rx=/^[a-z][a-z0-9_-]{2,64}$/;
const speakers=new Set(['patient','companion','doctor','unknown']);
const pii=/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b(?:\+?55)?\s?\(?\d{2}\)?\s?9?\d{4}[- ]?\d{4}\b|https?:\/\/)/i;
const labels={patient:'Paciente',companion:'Acompanhante',doctor:'Médico',unknown:'Interlocutor'};
const obj=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
function invalid(){throw new Error('LAB_DEIDENTIFIED_CONTRACT_REQUIRED');}
function checkCase(c){
 if(!obj(c,['schema_version','case_id','source','deidentification_reviewed','fields','phrases','expected_critical','remote_snapshots','medical_review'])||
   c.schema_version!==LAB_CONTRACT||!rx.test(c.case_id)||!['synthetic','deidentified'].includes(c.source)||
   c.deidentification_reviewed!==true||!Array.isArray(c.phrases)||c.phrases.length<1||c.phrases.length>40||
   !Array.isArray(c.expected_critical)||c.expected_critical.length>24||
   c.expected_critical.some(x=>typeof x!=='string'||!Object.hasOwn(Engine.concepts,x))||
   !obj(c.fields??{},['queixa_principal','hda','antecedentes','alergias','comorbidades','medicacoes','exame_fisico','sinais_vitais']))
   invalid();
 const fields=c.fields??{};
 for(const value of Object.values(fields))if(typeof value!=='string'||value.length>1000||pii.test(value))invalid();
 for(const p of c.phrases){
  if(!obj(p,['speaker','text'])||!speakers.has(p.speaker)||
     typeof p.text!=='string'||p.text.length<3||p.text.length>500||pii.test(p.text))invalid();
 }
 if(c.remote_snapshots!==undefined&&(!Array.isArray(c.remote_snapshots)||
   c.remote_snapshots.length!==c.phrases.length||
   c.remote_snapshots.some(s=>s!==null&&(!obj(s,['items','observations','alerts','version'])||
   !Array.isArray(s.items)||s.items.length>16||!Array.isArray(s.observations)||s.observations.length>32||
   (s.alerts!==undefined&&(!Array.isArray(s.alerts)||s.alerts.length>32))))))
   invalid();
 if(c.medical_review!==undefined&&(!obj(c.medical_review,['reviewer_verdict','notes_code'])||
   !['not_reviewed','approved','blocked'].includes(c.medical_review.reviewer_verdict)||
   (c.medical_review.notes_code!==undefined&&!rx.test(c.medical_review.notes_code))))invalid();
 return fields;
}
function quoteSpeaker(quote,phrases){
 const plain=String(quote||'').replace(/^(?:Médico|Paciente|Acompanhante|Interlocutor):\s*/i,'').trim();
 const hit=phrases.filter(p=>p.text.includes(plain)&&plain.length>=3);
 return hit.length===1?hit[0].speaker:'unknown';
}
function evidence(state,context,phrases){
 const out=[];
 for(const [concept,fact] of Object.entries(state.facts??{})){
  for(const ev of (fact?.evidence??[]).slice(0,8)){
   const quote=typeof ev?.quote==='string'?ev.quote:'';
   if(quote.length<3||quote.length>500)continue;
   const section=String(ev.section||'transcript');
   const source=section==='transcript'?context.transcript:String(context.fields?.[section]||'');
   if(!source.includes(quote))continue; // No fabricated origin.
   out.push({concept,quote,section,speaker:section==='transcript'?quoteSpeaker(quote,phrases):'unknown',
    confidence:'unknown',state:fact.state,conflict:fact.conflict===true});
   if(out.length>=100)return out;
  }
 }
 return out;
}
function normalize({provider,questions,alerts,evidence:proof,version='unknown'}){
 const qs=Array.isArray(questions)?questions:[],as=Array.isArray(alerts)?alerts:[];
 return {schema_version:LAB_CONTRACT,provider,model_version:String(version).slice(0,80),
  questions:qs.slice(0,32).filter(i=>i&&typeof i.concept==='string').map(i=>({
   concept:i.concept,priority:['critical','high','moderate','low'].includes(i.priority)?i.priority:'moderate',
   status:['asked','confirm','to_ask'].includes(i.status)?i.status:'unknown'})),
  alerts:as.slice(0,32).map(i=>String(i?.concept||i?.id||i||'')).filter(id=>Object.hasOwn(Engine.concepts,id)),
  contradictions:(proof||[]).filter(x=>x.conflict===true).map(x=>({concept:x.concept,speaker:x.speaker,section:x.section})),
  uncertainties:(proof||[]).filter(x=>x.state==='unknown'||x.speaker==='unknown').map(x=>({concept:x.concept,source:x.section})),
  evidence:proof||[],audit:[],responses:[]};
}
function metric(frame,expected){
 const questions=new Set(frame.questions.map(i=>i.concept));
 return {missing_required_critical:expected.filter(id=>!questions.has(id)),
   potential_speaker_misattribution:frame.evidence.filter(e=>
     e.section==='transcript'&&e.state==='known_present'&&e.speaker!=='patient').length};
}
export function replayShadowCase(c){
 const fields=checkCase(c),previous=[],frames=[],duration=[];
 const all=Object.keys(Engine.concepts),phrases=[];
 for(const phrase of c.phrases){
  phrases.push(phrase);
  const transcript=phrases.map(x=>labels[x.speaker]+': '+x.text).join('\n');
  const context={fields,transcript};
  const t=performance.now();
  const localState=Engine.analyze(context);
  const local=normalize({provider:'local',questions:localState.items,alerts:localState.alerts,
    evidence:evidence(localState,context,phrases),version:'rules-current'});
  const cpuPayload=createCoreRadarRequest({transcript,fields,conceptIds:all,model:'shadow-cpu'});
  const coreResult=inferRadarLocally(cpuPayload).result;
  // Core is shadow-only. This is a baseline; it must never modify NEXA UI.
  const core=normalize({provider:'nexa-core-shadow',questions:coreResult.items,
    alerts:[],evidence:coreResult.observations.map(e=>({...e,confidence:'unknown',
     speaker:e.section==='transcript'?quoteSpeaker(e.quote,phrases):'unknown',
     conflict:false})),version:'cpu-baseline'});
  const remotePayload=c.remote_snapshots?.[frames.length]??null;
  const remote=remotePayload?normalize({provider:'remote-offline-snapshot',questions:remotePayload.items,
    alerts:remotePayload.alerts??[],evidence:[],version:remotePayload.version??'unknown'}):null;
  const latencyMs=Math.round((performance.now()-t)*1000)/1000;
  duration.push(latencyMs);
  frames.push({phrase_number:frames.length+1,local,core,remote,
    metrics:{local:metric(local,c.expected_critical),core:metric(core,c.expected_critical)},
    latency_ms:latencyMs,api_calls:0,paid_cost_usd:0,remote_cost_usd:null});
 }
 const last=frames.at(-1);
 const blocked=frames.some(f=>f.metrics.local.potential_speaker_misattribution>0||
   f.metrics.core.potential_speaker_misattribution>0)||
   last.metrics.local.missing_required_critical.length>0||
   last.metrics.core.missing_required_critical.length>0;
 const sorted=duration.slice().sort((a,b)=>a-b),p=q=>sorted[Math.min(sorted.length-1,Math.ceil(q*sorted.length)-1)];
 return {schema_version:LAB_CONTRACT,case_id:c.case_id,mode:'shadow_offline',
   frames,summary:{case_count:1,phrase_count:frames.length,case_review:c.medical_review?.reviewer_verdict??'not_reviewed',
   remote_status:c.remote_snapshots?'offline_snapshots_only':'unavailable',
   local_and_core_api_calls:0,remote_billing_usd:null,latency_p50_ms:p(.5),latency_p95_ms:p(.95),
   missed_critical_last_frame:Math.max(last.metrics.local.missing_required_critical.length,
      last.metrics.core.missing_required_critical.length),
   speaker_attribution_risk_frames:frames.filter(f=>f.metrics.local.potential_speaker_misattribution||
     f.metrics.core.potential_speaker_misattribution).length,
   status:blocked?'BLOCKED_CLINICAL_REVIEW_REQUIRED':'SYNTHETIC_PASSED_NOT_CLINICALLY_VALIDATED'}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const input=readFileSync(0,'utf8');
  if(Buffer.byteLength(input)>65536)invalid();
  const out=replayShadowCase(JSON.parse(input));
  // Only counts, no phrases, quotes, audio, case IDs or identifiers on stdout.
  process.stdout.write(JSON.stringify(out.summary,null,2)+'\n');
 }catch{
  process.stderr.write('Rejected: synthetic or manually deidentified lab case required.\n');
  process.exitCode=1;
 }
}
