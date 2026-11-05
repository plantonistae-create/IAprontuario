'use strict';

// OFFLINE LAB ONLY: never imported by frontend, Edge Functions or service worker.
// Not a replacement for NexaRadarController's clinically reviewed scheduler.
// A fixture's urgent label is an idealized oracle, NOT a validated triage detector.
// This simulator cannot prove safety or quality for atypical/unrecognized findings.
const CANDIDATE_ENABLED_IN_PRODUCTION = false;
const SUPPORTED_INTERVALS_MS = Object.freeze([1500, 12000, 16000]);

function simulateRadarCadence(events, {cadenceMs = 1500, localAnalyze = () => null} = {}) {
  if (!SUPPORTED_INTERVALS_MS.includes(cadenceMs)) throw Error('UNAPPROVED_RADAR_CADENCE');
  if (!Array.isArray(events) || events.length < 1 || events.length > 200 ||
      typeof localAnalyze !== 'function') throw Error('INVALID_RADAR_CADENCE_EVENTS');

  const sent = [], local = [];
  let lastSent = -Infinity, pending = null, previousAt = -1, previousIndex = -1;
  function dispatch(atMs, index, why) {
    if (atMs < lastSent || index <= previousIndex) throw Error('INVALID_RADAR_CADENCE_ORDER');
    sent.push({atMs, lastEvidenceIndex:index, why});
    lastSent = atMs;
    previousIndex = index;
    pending = null;
  }

  for (const [index, event] of events.entries()) {
    const time = event?.atMs;
    if (!Number.isSafeInteger(time) || time < 0 || time <= previousAt ||
        typeof event.transcript !== 'string' ||
        !event.fields || typeof event.fields !== 'object' || Array.isArray(event.fields))
      throw Error('INVALID_RADAR_CADENCE_EVENT');
    previousAt = time;

    // A scheduled remote request may execute between audio chunks.
    // Never reorder an already due request behind a later chunk.
    if (pending && pending.atMs < time) dispatch(pending.atMs,pending.index,'scheduled');
    const assessment = localAnalyze({fields:event.fields,transcript:event.transcript},event);
    local.push({atMs:time, assessment});
    // The urgent annotation is provided externally by a synthetic fixture.
    // A future production gate would need independent evidence that it detects
    // *all* important findings; this laboratory does not supply that guarantee.
    if (event.urgent === true) {
      dispatch(time,index,'fixture-urgent');
    } else if (!Number.isFinite(lastSent) || time - lastSent >= cadenceMs) {
      dispatch(time,index,'cadence');
    } else {
      pending = {atMs:lastSent+cadenceMs,index};
      if (pending.atMs === time) dispatch(time,index,'scheduled');
    }
  }
  // Simulate a safe end-of-recording flush. Last recognized text is always
  // covered by a remote request, but the live production controller is UNCHANGED.
  if (pending) dispatch(pending.atMs,pending.index,'end-flush');
  const lastEvidenceIndex = events.length-1;
  if (sent[sent.length-1].lastEvidenceIndex !== lastEvidenceIndex)
    throw Error('INCOMPLETE_SIMULATED_RADAR_CONTEXT');
  const urgency = events.map((e,i)=>({atMs:e.atMs,remoteAtMs:
    e.urgent === true ? sent.find(call=>call.lastEvidenceIndex>=i)?.atMs:null
  })).filter(x=>x.remoteAtMs!==null);
  return {
    cadenceMs, calls:sent.length,
    scheduled:sent, localUpdates:local.length,
    localAnalysisTimes:local.map(x=>x.atMs),
    urgentRemoteDelayMs:urgency.map(x=>x.remoteAtMs-x.atMs),
    evidenceDelaysMs:events.map((e,i)=>sent.find(call=>call.lastEvidenceIndex>=i).atMs-e.atMs),
    finalTranscriptCovered:true
  };
}

function compareRadarCadences(events, localAnalyze) {
  const current = simulateRadarCadence(events,{cadenceMs:1500,localAnalyze});
  const at12 = simulateRadarCadence(events,{cadenceMs:12000,localAnalyze});
  const at16 = simulateRadarCadence(events,{cadenceMs:16000,localAnalyze});
  const comparison = [current,at12,at16].map(row=>({
    intervalMs:row.cadenceMs,
    calls:row.calls,
    callsAvoidedVsCurrent:current.calls-row.calls,
    reductionPct:Math.round(10000*(current.calls-row.calls)/current.calls)/100,
    urgentRemoteDelayMs:row.urgentRemoteDelayMs,
    localUpdates:row.localUpdates,
    finalTranscriptCovered:row.finalTranscriptCovered
  }));
  return {candidateEnabledInProduction:CANDIDATE_ENABLED_IN_PRODUCTION,comparison};
}

module.exports={CANDIDATE_ENABLED_IN_PRODUCTION,SUPPORTED_INTERVALS_MS,simulateRadarCadence,compareRadarCadences};
