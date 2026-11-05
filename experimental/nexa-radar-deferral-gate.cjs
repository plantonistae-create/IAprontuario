'use strict';

// OFFLINE RELEASE GATE. This module is not imported in clinical production.
// The existing Radar engine is the only local classifier inspected here.
// A clinical finding can be invisible to that engine: unchanged local output
// does NOT prove that remote analysis may be delayed.
const Engine=require('../nexa-radar-engine');

function validEnvelope(x){
  return x && typeof x==='object' && !Array.isArray(x) &&
    typeof x.transcript==='string' &&
    x.fields && typeof x.fields==='object' && !Array.isArray(x.fields) &&
    typeof x.owner==='string' && x.owner.length>0 &&
    typeof x.encounter==='string' && x.encounter.length>0 &&
    typeof x.recordingState==='string' &&
    typeof x.transcriptStatus==='string' &&
    x.transcript.length<=100000;
}

function summarizeLocal(x){
  const state=Engine.analyze({fields:x.fields,transcript:x.transcript,cid:x.cid||''});
  const facts=Object.fromEntries(Object.entries(state.facts||{}).map(([key,f])=>
    [key,{state:f.state,temporal:f.temporal,conflict:!!f.conflict}]));
  return JSON.stringify({
    facts,
    alerts:(state.alerts||[]).map(i=>[i.id,i.concept,i.priority]),
    items:(state.items||[]).map(i=>[i.id,i.concept,i.priority,i.status]),
    unresolvedSafety:state.unresolvedSafety||[],
    dispositionCaution:!!state.dispositionCaution
  });
}

// The return value is *only* technical categories and booleans; do not return
// patient text, suggestions or user identities in observability.
function inspectRadarDeferral(previous,current,{force=false,closing=false,retry=false}={}){
  if(!validEnvelope(current)||previous!==null&&!validEnvelope(previous))
    return {decision:'immediate',reason:'INVALID_OR_MISSING_CONTEXT',localChanged:null};
  if(!previous)return {decision:'immediate',reason:'FIRST_CONTEXT',localChanged:null};
  if(force||retry||closing)
    return {decision:'immediate',reason:'FORCED_RETRY_OR_CLOSE',localChanged:null};
  if(current.owner!==previous.owner||current.encounter!==previous.encounter)
    return {decision:'immediate',reason:'OWNER_OR_ENCOUNTER_CHANGED',localChanged:null};
  if(current.recordingState!==previous.recordingState||
      current.transcriptStatus!==previous.transcriptStatus)
    return {decision:'immediate',reason:'RECORDING_OR_TRANSCRIPT_STATE_CHANGED',localChanged:null};
  if(['stale','unavailable','incomplete'].includes(current.transcriptStatus))
    return {decision:'immediate',reason:'INCOMPLETE_OR_UNAVAILABLE_ASR',localChanged:null};

  // Unknown recording/audit/clinical flags cannot be interpreted as harmless.
  // Exclude only fixture timestamps and the untrusted fixture urgency oracle.
  const otherState=x=>{const {owner,encounter,recordingState,transcriptStatus,
    transcript,fields,cid,atMs,urgent,...rest}=x;return JSON.stringify(rest);};
  try {
    if(otherState(previous)!==otherState(current))
      return {decision:'immediate',reason:'ADDITIONAL_CLINICAL_STATE_CHANGED',localChanged:null};
  } catch {
    return {decision:'immediate',reason:'UNKNOWN_CONTEXT_STATE',localChanged:null};
  }

  let sameFields=false,localBefore,localAfter;
  try{
    sameFields=JSON.stringify(previous.fields)===JSON.stringify(current.fields)
      &&String(previous.cid||'')===String(current.cid||'');
    localBefore=summarizeLocal(previous);
    localAfter=summarizeLocal(current);
  }catch{
    return {decision:'immediate',reason:'LOCAL_ANALYSIS_UNAVAILABLE',localChanged:null};
  }
  const localChanged=localBefore!==localAfter;
  if(!sameFields) return {decision:'immediate',reason:'CLINICAL_FIELDS_CHANGED',localChanged};
  if(previous.transcript!==current.transcript)
    return {decision:'immediate',
      reason:localChanged?'RECOGNIZED_OR_CONFLICTING_EVIDENCE':'UNRECOGNIZED_OR_REPHRASED_EVIDENCE',
      localChanged};
  if(localChanged)return {decision:'immediate',reason:'LOCAL_STATE_CHANGED',localChanged:true};
  // Identical inputs do not require an extra remote analysis. This is a
  // duplicate-suppression observation, NOT approval to delay a new utterance.
  return {decision:'exact_duplicate',reason:'IDENTICAL_CONTEXT',localChanged:false};
}

function summarizeGateSequence(events){
  if(!Array.isArray(events)||events.length===0||events.length>200)
    throw Error('INVALID_RADAR_GATE_EVENTS');
  const results=events.map((event,index)=>
    inspectRadarDeferral(index?events[index-1]:null,event));
  return {
    decisions:results.map(x=>({decision:x.decision,reason:x.reason,localChanged:x.localChanged})),
    mustAnalyzeImmediately:results.filter(x=>x.decision==='immediate').length,
    exactDuplicates:results.filter(x=>x.decision==='exact_duplicate').length,
    approvedForLongerCadence:false
  };
}

module.exports={inspectRadarDeferral,summarizeGateSequence};
