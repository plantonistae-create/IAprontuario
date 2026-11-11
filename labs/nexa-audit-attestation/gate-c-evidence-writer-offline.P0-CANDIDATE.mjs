/* LAB ONLY: translates independently verified server events to private
 * evidence rows. Never reads clinician checkbox, client timestamp, or request
 * claims as an attestation; never creates a trusted event.
 * This file has no Supabase/HTTP dependencies and is NOT deployed.
 */
const stop=code=>Object.freeze({status:'STOP',code,wroteEvidence:false,resetAuthorized:false});
const id=x=>typeof x==='string'&&x.length>=3&&x.length<=128;
export async function materializeGateCEvidenceOffline({auth,sourceEvents,db}={}){
 try{
  if(typeof auth?.getUser!=='function'||
     typeof sourceEvents?.nextVerifiedEvent!=='function'||
     typeof db?.materializeEvent!=='function')
    return stop('TRUSTED_BACKEND_PROVIDERS_MISSING');
  const actor=await auth.getUser();
  if(!id(actor?.id))return stop('UNAUTHENTICATED');
  // Server evidence provider, not an HTTP request field or localStorage.
  const event=await sourceEvents.nextVerifiedEvent(actor.id);
  if(!id(event?.id)||
    !['PHYSICIAN_PATIENT_CONSENT_ATTESTATION','PHYSICIAN_FINAL_REVIEW_ACK']
      .includes(event?.kind)||
    event?.serverVerified!==true||
    event?.ownerUserId!==actor.id)
    return stop('NO_SERVER_VERIFIED_EXPLICIT_EVENT');
  const current=await auth.getUser();
  if(!id(current?.id)||current.id!==actor.id)
    return stop('AUTH_CHANGED_BEFORE_WRITE');
  // DB function verifies event provenance, source owner, version, purpose,
  // server ACK and content digest under the same transaction as evidence INSERT.
  const result=await db.materializeEvent({p_actor:current.id,p_event_id:event.id});
  const expect=event.kind==='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
    ?'CONSENT_EVIDENCE_RECORDED':'FINAL_REVIEW_EVIDENCE_RECORDED';
  if(result!==expect)return stop('WRITER_COMMIT_NOT_CONFIRMED');
  return Object.freeze({status:'RECORDED_LAB',kind:event.kind,
    wroteEvidence:true,resetAuthorized:false});
 }catch{return stop('WRITER_FAIL_CLOSED')}
}
