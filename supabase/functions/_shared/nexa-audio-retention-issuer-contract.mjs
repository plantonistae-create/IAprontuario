// NEXA Core P0 — candidate preflight ONLY, never an issuance authority.
// Not deployed. No existing server-owned consent ledger for original audio
// retention has been proven. Browser consent, consultation_history timestamps,
// AI processing permissions, and training approvals are NOT that ledger.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const POLICY=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const PURPOSE='clinical_audio_retention';
export class RetentionIssuerError extends Error{
  constructor(code,status){super(code);this.name='RetentionIssuerError';this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new RetentionIssuerError(code,status)};
export function parseRetentionIssueRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input))
    fail('INVALID_ISSUANCE_REQUEST',400);
  const keys=Object.keys(input).sort();
  // No caller can submit 'consent', 'grant', 'server_verified', policy,
  // training approval, a digest, or a rights assertion.
  if(keys.join(',')!=='client_action_id,encounter_id')
    fail('UNTRUSTED_ISSUANCE_FIELDS',400);
  const {client_action_id,encounter_id}=input;
  if(typeof client_action_id!=='string'||!UUID.test(client_action_id)||
     typeof encounter_id!=='string'||!UUID.test(encounter_id))
    fail('INVALID_ISSUANCE_IDENTIFIER',400);
  return Object.freeze({client_action_id:client_action_id.toLowerCase(),
    encounter_id:encounter_id.toLowerCase()});
}
export async function preflightRetentionGrantIssuance({
  actor,request,source,capabilities,serverPolicy,evidenceAuthority,priorAction,
  now=Date.now()
}){
  const cmd=parseRetentionIssueRequest(request);
  if(typeof actor!=='string'||!UUID.test(actor))
    fail('UNAUTHENTICATED_ISSUER_ACTOR',401);
  const owner=actor.toLowerCase();
  if(!capabilities||capabilities.access_status!=='active'||
     capabilities.clinical_access!==true)
    fail('CLINICAL_ACCESS_REQUIRED',403);
  if(!source||source.user_id!==owner||source.encounter_id!==cmd.encounter_id)
    fail('SOURCE_NOT_OWNED_OR_UNAVAILABLE',403);
  if(!serverPolicy||serverPolicy.purpose!==PURPOSE||
     typeof serverPolicy.version!=='string'||!POLICY.test(serverPolicy.version)||
     typeof serverPolicy.terms_digest!=='string'||!HASH.test(serverPolicy.terms_digest)||
     serverPolicy.independently_approved!==true)
    fail('AUDIO_RETENTION_POLICY_NOT_APPROVED',423);
  if(priorAction){
    if(priorAction.owner_user_id!==owner||
       priorAction.encounter_id!==cmd.encounter_id||
       priorAction.client_action_id!==cmd.client_action_id||
       priorAction.purpose!==PURPOSE)
      fail('ISSUER_ACTION_CONFLICT',409);
    // An existing action still requires independent, transactional verification.
    // Never interpret its existence as authority to emit another grant.
  }
  // The only permitted evidence comes from an independently controlled,
  // immutable SERVER-side ledger, looked up by owner + encounter.
  // There is no such connected authority in the current NEXA deployment.
  if(!evidenceAuthority||typeof evidenceAuthority.readVerifiedAttestation!=='function')
    fail('CONSENT_ISSUER_AUTHORITY_MISSING',423);
  let event;
  try{event=await evidenceAuthority.readVerifiedAttestation({
    owner_user_id:owner,encounter_id:cmd.encounter_id,purpose:PURPOSE
  });}catch{fail('CONSENT_ISSUER_AUTHORITY_UNAVAILABLE',423)}
  if(!event||typeof event.event_id!=='string'||!UUID.test(event.event_id)||
     event.origin!=='immutable_server_retention_ledger_v1'||
     event.verified_by_server!==true||
     event.attested_by!==owner||event.owner_user_id!==owner||
     event.encounter_id!==cmd.encounter_id||event.purpose!==PURPOSE||
     event.revoked_at!==null||
     event.policy_version!==serverPolicy.version||
     event.terms_digest!==serverPolicy.terms_digest||
     typeof event.expires_at!=='string'||!Number.isFinite(Date.parse(event.expires_at))||
     Date.parse(event.expires_at)<=now)
    fail('AUDIO_RETENTION_ATTESTATION_NOT_VERIFIED',423);
  // A preflight is NOT a grant. It cannot persist or set server_verified.
  // Future atomic, service-only issuer RPC must re-check the event under lock,
  // enforce unique(owner, encounter, action), and record short validity.
  const expires_at=new Date(Math.min(now+15*60*1000,Date.parse(event.expires_at))).toISOString();
  return Object.freeze({kind:'uncommitted_retention_preflight',
    owner_user_id:owner,encounter_id:cmd.encounter_id,
    client_action_id:cmd.client_action_id,attestation_event_id:event.event_id,
    purpose:PURPOSE,policy_version:serverPolicy.version,expires_at,
    grant_issued:false,server_verified:false,requires_atomic_issuer:true});
}
