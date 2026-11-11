/* NEXA P0 Gate C - executable OFFLINE Edge orchestration candidate.
 * No network, OpenAI, Supabase or production imports.
 * Uses injectable server-auth, DB RPC and deidentification ports.
 * DO NOT DEPLOY. SQL candidate is unexecuted; production gate is CLOSED.
 */
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const denied=(code)=>Object.freeze({status:'STOP',code,privilegedWriteAuthorized:false,resetAuthorized:false});
const id=x=>typeof x==='string'&&x.length>2&&x.length<129;
const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

/** Example server-only orchestration boundary:
 * auth.getUser(): MUST verify JWT with Auth server, twice.
 * db.checkpoint(): service_role-only RPC reading source/consent/review receipts.
 * deidentify(): injection; tests use a synthetic stub, NEVER a paid call.
 * validateDeidentified(): mandatory security validation, fail-closed.
 * db.commit(): service_role-only atomic RPC, NEVER a sequence of PostgREST writes.
 */
export async function submitGateCOffline({request,auth,db,deidentify,validateDeidentified}={}){
 try{
  if(!obj(request)||!id(request.source_consultation_id)||
    !Number.isSafeInteger(request.expected_sync_version)||request.expected_sync_version<1)
    return denied('INVALID_SELECTION');
  // Legacy client sends fields/core_context: do not silently accept them as authority.
  if(['fields','core_context','processing_meta','protocol_usage','submitted_by',
      'owner_user_id','tenant_id','auditSubmit'].some(k=>hasOwn(request,k)))
    return denied('CLIENT_CLINICAL_OR_IDENTITY_PAYLOAD_FORBIDDEN');
  if(!auth||typeof auth.getUser!=='function'||!db||
    typeof db.checkpoint!=='function'||typeof db.commit!=='function'||
    typeof deidentify!=='function'||typeof validateDeidentified!=='function')
    return denied('TRUSTED_SERVER_PORTS_REQUIRED');
  const first=await auth.getUser();
  if(!id(first?.id))return denied('UNAUTHORIZED');
  const receipt=await db.checkpoint({
    p_actor:first.id,p_encounter:request.source_consultation_id,
    p_expected_version:request.expected_sync_version
  });
  if(!id(receipt?.receipt_id)||!id(receipt?.payload_digest)||
     !obj(receipt?.source_payload)||!obj(receipt.source_payload.fields)||
     !obj(receipt.source_payload.processing_meta)||
     !Array.isArray(receipt.source_payload.protocol_usage)||
     receipt.source_version!==request.expected_sync_version)
    return denied('SERVER_CHECKPOINT_NOT_ATTESTED');
  // Server-owned source payload only; no client-origin clinical payload at all.
  const raw=await deidentify(receipt.source_payload);
  const checked=await validateDeidentified(raw);
  if(!obj(checked)||checked.ok!==true||!obj(checked.fields)||
     !obj(checked.core_context))
    return denied('DEIDENTIFICATION_NOT_VALIDATED');
  // JWT validity may change while the AI processes. Verify again before commit.
  const second=await auth.getUser();
  if(!id(second?.id)||second.id!==first.id)
    return denied('AUTH_CHANGED_BEFORE_ATOMIC_COMMIT');
  const outcome=await db.commit({
    p_actor:second.id,p_receipt:receipt.receipt_id,
    p_input_digest:receipt.payload_digest,
    p_deidentified_fields:checked.fields,
    p_deidentified_core:checked.core_context
  });
  if(outcome?.outcome==='INSERTED_PENDING'&&id(outcome.audit_case_id))
    return Object.freeze({status:'SAVED_PENDING',caseId:outcome.audit_case_id,
      privilegedWriteAuthorized:false,resetAuthorized:false});
  if(outcome?.outcome==='ALREADY_MATCHED_PENDING'&&id(outcome.audit_case_id))
    return Object.freeze({status:'MATCHED_PENDING',caseId:outcome.audit_case_id,
      privilegedWriteAuthorized:false,resetAuthorized:false});
  return denied('ATOMIC_COMMIT_NOT_ATTESTED');
 }catch{
  // Errors, including SQL exceptions and 409, are NOT equality proof and
  // must not trigger another paid deidentification or reset locked.
  return denied('GATE_C_FAIL_CLOSED');
 }
}
