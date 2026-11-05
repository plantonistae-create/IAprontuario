'use strict';
// Offline-only conservative safety gate for the cadence laboratory.
// IMPORTANT: this does not classify a new utterance as clinically harmless.
// Local findings are not a complete substitute for the remote differential.
const E=require('../nexa-radar-engine');
const {compareRadarCadences,simulateRadarCadence}=require('./nexa-radar-cadence-lab.cjs');

const PRODUCTION_GATE_ENABLED=false;
const states=new Set(['idle','recording','paused','stopped','stale','unavailable']);
const isPlainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const trimOnlyEndOfLine=s=>s.replace(/[ \t]+(?=\r?$)/gm,'');
function validSnapshot(s){
  return isPlainObject(s)&&typeof s.transcript==='string'&&isPlainObject(s.fields)&&
    Object.values(s.fields).every(v=>['string','number','boolean'].includes(typeof v)||
      v===null)&&
    (!('recordingState' in s)||states.has(s.recordingState))&&
    (!('owner' in s)||typeof s.owner==='string')&&
    (!('encounter' in s)||typeof s.encounter==='string');
}
function safeKey(s){
  return JSON.stringify({
    transcript:trimOnlyEndOfLine(s.transcript),
    fields:Object.fromEntries(Object.entries(s.fields)
      .map(([key,value])=>[key,typeof value==='string'?trimOnlyEndOfLine(value):value])),
    cid:s.cid??null
  });
}
function assessment(s){
  const x=E.analyze({transcript:s.transcript,fields:s.fields,cid:s.cid});
  // The comparison is strictly an additional safety guard; even identical
  // known findings never authorize deferring newly observed raw utterances.
  return {
    alerts:x.alerts.map(a=>a.id).sort(),
    criticalCount:x.criticalCount,
    unresolvedSafety:[...x.unresolvedSafety].sort(),
    findings:Object.entries(x.facts).map(([concept,fact])=>
      [concept,fact.state,fact.conflict===true]).sort(([a],[b])=>a.localeCompare(b))
  };
}
function decideConservativeDeferral(before,after){
  const blocked=(reason,change={})=>({
    allowSkip:false,allowDelay:false,requiresRemoteReview:true,reason,...change
  });
  if(!validSnapshot(after)||before!==null&&!validSnapshot(before))
    return blocked('INVALID_OR_UNKNOWN_CONTEXT');
  if(before===null)return blocked('FIRST_EVIDENCE');
  if((before.owner??null)!==(after.owner??null)||
    (before.encounter??null)!==(after.encounter??null))
    return blocked('IDENTITY_OR_ENCOUNTER_CHANGE');
  if((before.recordingState??'idle')!==(after.recordingState??'idle'))
    return blocked('RECORDING_TRANSITION',{
      flushRequired:after.recordingState==='stopped'
    });
  if(after.recordingState==='stale'||after.recordingState==='unavailable')
    return blocked('INCOMPLETE_AUDIO');
  if(safeKey(before)===safeKey(after)){
    // This is a true duplicate up to trailing formatting; do not create
    // any remote request. It is NOT permission to delay new clinical text.
    return {
      allowSkip:true,allowDelay:false,requiresRemoteReview:false,
      reason:'EXACT_OR_TRAILING_WHITESPACE_DUPLICATE'
    };
  }
  const old=assessment(before),current=assessment(after);
  const changed=JSON.stringify(old)!==JSON.stringify(current);
  return blocked(changed?'LOCAL_CLINICAL_FINDINGS_CHANGED':'NEW_UNRECOGNIZED_EVIDENCE');
}
function auditCadenceSafety(events){
  if(!Array.isArray(events)||events.length===0||events.length>200)
    throw Error('INVALID_SAFETY_AUDIT_EVENTS');
  // NEVER use a synthetic fixture's "urgent" label to authorize a real
  // bypass. This shows what happens if the local detector misses a finding.
  const unbiased=events.map(x=>({...x,urgent:false}));
  const decisions=unbiased.map((event,i)=>
    decideConservativeDeferral(i===0?null:unbiased[i-1],event));
  const tested=[1500,12000,16000].map(cadenceMs=>{
    const run=simulateRadarCadence(unbiased,{cadenceMs,localAnalyze:
      context=>E.analyze(context)});
    const unsafeEvents=decisions.flatMap((decision,i)=>
      decision.requiresRemoteReview&&run.evidenceDelaysMs[i]>0
      ?[{index:i,reason:decision.reason,delayMs:run.evidenceDelaysMs[i]}]:[]);
    return {
      cadenceMs,simulationCalls:run.calls,
      localEvaluations:run.localUpdates,unsafeDeferrals:unsafeEvents.length,
      maxDelayMs:Math.max(0,...unsafeEvents.map(x=>x.delayMs)),
      unsafeEvents,
      suitableForClinicalActivation:false
    };
  });
  return {productionGateEnabled:PRODUCTION_GATE_ENABLED,
    candidateSafeForProduction:false,decisions,comparisons:tested};
}
module.exports={PRODUCTION_GATE_ENABLED,decideConservativeDeferral,auditCadenceSafety};
