/* Candidate-only Radar ledger transport. The database remains the authority for access and sequence. */
(function(root){
  'use strict';
  const verified=new WeakSet();
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const question=/^(?:conflict:)?[a-z][A-Za-z0-9_]{0,63}$/;
  const concept=/^[a-z][a-z0-9_]{0,63}$/;
  const eventTypes=new Set(['appeared','changed','removed','manual_answer','reopened']);
  const statuses=new Set(['to_ask','asked','confirm','clarified','dismissed','not_applicable']);
  const priorities=new Set(['critical','high','moderate','low']);
  const reasons=new Set(['engine_recalculation','no_longer_suggested','patient_answer','clinician_answer',
    'manual_reopen','not_applicable','superseded','unresolved_conflict']);
  const origins=new Set(['engine','ai','human']);
  const fail=()=>{throw new Error('RADAR_LEDGER_BINDING_UNVERIFIED')};
  const validUuid=value=>typeof value==='string'&&uuid.test(value);
  const nullable=(value,allowed)=>value==null||allowed.has(value);

  function bind({consultation,activeEncounterId,userId,organizationId}={}){
    const id=consultation?.id;
    if(typeof id!=='string'||!id.trim()||id.length>200||
       !validUuid(activeEncounterId)||!validUuid(userId)||!validUuid(organizationId)||
       consultation.encounter_id!==activeEncounterId||consultation.user_id!==userId||
       consultation.organization_id!==organizationId||
       !['draft','ready_for_audit'].includes(consultation.encounter_state))fail();
    // consultation_id is text, even when a newer row happens to look like a UUID.
    const result=Object.freeze({consultation_id:id,encounter_id:activeEncounterId,
      organization_id:organizationId,owner_user_id:userId});
    verified.add(result);
    return result;
  }

  function args(binding,event){
    if(!binding||!verified.has(binding))fail();
    const p={
      p_event_id:event?.event_id,p_consultation_id:binding.consultation_id,
      p_encounter_id:binding.encounter_id,p_organization_id:binding.organization_id,
      p_question_id:event?.id,p_concept:event?.concept,p_event_type:event?.type,
      p_previous_status:event?.previous_status??null,p_current_status:event?.current_status??null,
      p_previous_priority:event?.previous_priority??null,p_current_priority:event?.current_priority??null,
      p_reason_code:event?.reason_code,p_origin:event?.origin,p_engine_version:event?.engine_version,
      p_processing_id:event?.processing_id??null,p_evidence_ref_hash:event?.evidence_ref_hash??null,
      p_snapshot_version:event?.snapshot_version
    };
    if(!validUuid(p.p_event_id)||!question.test(p.p_question_id||'')||!concept.test(p.p_concept||'')||
       !eventTypes.has(p.p_event_type)||!nullable(p.p_previous_status,statuses)||
       !nullable(p.p_current_status,statuses)||!nullable(p.p_previous_priority,priorities)||
       !nullable(p.p_current_priority,priorities)||!reasons.has(p.p_reason_code)||
       !origins.has(p.p_origin)||!/^[A-Za-z0-9._:-]{1,80}$/.test(p.p_engine_version||'')||
       (p.p_processing_id!==null&&!validUuid(p.p_processing_id))||
       (p.p_evidence_ref_hash!==null&&!/^[0-9a-f]{64}$/.test(p.p_evidence_ref_hash))||
       !Number.isInteger(p.p_snapshot_version)||p.p_snapshot_version<1||p.p_snapshot_version>10000)
      throw new Error('RADAR_LEDGER_EVENT_INVALID');
    return p;
  }

  async function append(client,binding,event){
    if(typeof client?.rpc!=='function')throw new Error('RADAR_LEDGER_AUTH_CLIENT_REQUIRED');
    const payload=args(binding,event);
    let response;
    try{response=await client.rpc('append_nexa_radar_question_event',payload)}
    catch{throw new Error('RADAR_LEDGER_REMOTE_ACK_MISSING')}
    const {data,error}=response||{};
    if(error||!Number.isSafeInteger(data)||data<1)throw new Error('RADAR_LEDGER_REMOTE_ACK_MISSING');
    return data;
  }
  const api={bind,args,append};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.NexaRadarLedgerClient=api;
})(globalThis);
