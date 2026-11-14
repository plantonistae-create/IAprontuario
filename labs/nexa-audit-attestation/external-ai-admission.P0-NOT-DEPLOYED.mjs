/*
 * NEXA P0 - PRE-PROVIDER EXTERNAL AI ADMISSION (LAB ONLY, NOT DEPLOYED).
 *
 * Pure candidate contract. NO calls to a provider, network, Supabase, local
 * database or clinical handler. Does not mint a receipt or release audio/text.
 * Injected adapters are MOCKABLE, not proof of trusted server persistence.
 * EVEN A PERFECT SYNTHETIC MATCH NEVER AUTHORIZES EXTERNAL AI.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>o!==null&&typeof o==='object'&&Object.getPrototypeOf(o)===Object.prototype;
const ver=n=>Number.isSafeInteger(n)&&n>0;
const same=(a,b)=>typeof a==='string'&&a.length>0&&a===b;
const stop=code=>Object.freeze({
 status:'STOP',code,externalAiAuthorized:false,auditSubmitAuthorized:false,
 adminWriteAuthorized:false,clinicalPayloadReleased:false,
 gateCVerified:false,eventDurabilityVerified:false,resetAuthorized:false
});

/*
 * Route identities represent SEVEN distinct backend ingress paths, not
 * caller-supplied claims. The future handler MUST map its own route and
 * configured provider onto these strings; never accept either as authority
 * from browser JSON, FormData, query params or client timestamps.
 *
 * The purposes below are proposed technical separations only. Privacy,
 * institutional policy and actual consent semantics remain unapproved.
 */
export const PROVIDER_GATE_ROUTES=Object.freeze({
 'realtime-call.webrtc':Object.freeze({purpose:'realtime_audio',providers:Object.freeze(['openai'])}),
 'realtime-call.chunk':Object.freeze({purpose:'realtime_audio',providers:Object.freeze(['openai'])}),
 'realtime-radar':Object.freeze({purpose:'radar_context',providers:Object.freeze(['openai','nexa-core'])}),
 'consultation-speakers':Object.freeze({purpose:'audio_diarization',providers:Object.freeze(['openai'])}),
 'process-consultation.form-data':Object.freeze({purpose:'final_documentation',providers:Object.freeze(['openai','gemini'])}),
 'process-consultation.json':Object.freeze({purpose:'final_documentation',providers:Object.freeze(['openai'])}),
 'submit-audit-case':Object.freeze({purpose:'audit_deidentification',providers:Object.freeze(['openai'])})
});

/*
 * request: only {encounterId}; all consent/review/auth data must be read via
 * trusted SERVER implementations in any future integration.
 * - identity.getUser()
 * - source.readOwnerScopedForActor({actorId,encounterId,route})
 * - consent.readLatestPurposeEvent({actorId,sourceRowId,purpose})
 *
 * A pre-created, owner-bound source is a prerequisite even at recording start.
 * The current UI does NOT establish such a binding before startRec().
 * That migration/integration is NOT part of this candidate.
 */
export async function inspectExternalAiAdmissionCandidate({
 route,configuredProvider,request,identity,source,consent
}={}){
 try{
  const policy=own(PROVIDER_GATE_ROUTES,route)?PROVIDER_GATE_ROUTES[route]:null;
  if(!policy)return stop('BACKEND_ROUTE_UNKNOWN');
  if(!policy.providers.includes(configuredProvider))return stop('SERVER_PROVIDER_PURPOSE_MISMATCH');
  if(!plain(request)||Object.keys(request).length!==1||
     !own(request,'encounterId')||!UUID.test(request.encounterId||''))
   return stop('CLIENT_REQUEST_MUST_BE_ROUTING_ONLY');
  if(typeof identity?.getUser!=='function'||
     typeof source?.readOwnerScopedForActor!=='function'||
     typeof consent?.readLatestPurposeEvent!=='function')
   return stop('SERVER_AUTHORITY_ADAPTERS_NOT_IMPLEMENTED');
  const actor=await identity.getUser();
  if(!UUID.test(actor?.id||''))return stop('AUTHENTICATED_ACTOR_REQUIRED');
  if(own(actor,'tenantId'))return stop('UNSUPPORTED_INSTITUTIONAL_TENANT_CLAIM');
  const row=await source.readOwnerScopedForActor({
   actorId:actor.id,encounterId:request.encounterId,route
  });
  if(!plain(row)||!UUID.test(row.sourceRowId||'')||
     !same(row.ownerUserId,actor.id)||
     !same(row.encounterId,request.encounterId)||
     !ver(row.syncVersion)||
     row.activeSlotVerified!==true||
     row.clinicalAccessVerified!==true)
   return stop('SOURCE_OWNER_ACTIVE_SLOT_NOT_VERIFIED');
  if(own(row,'tenantId')||own(row,'tenantMembershipVerified'))
   return stop('UNSUPPORTED_INSTITUTIONAL_TENANT_CLAIM');
  const event=await consent.readLatestPurposeEvent({
   actorId:actor.id,sourceRowId:row.sourceRowId,purpose:policy.purpose
  });
  if(!plain(event)||event.purpose!==policy.purpose||
     !same(event.actorId,actor.id)||
     !same(event.sourceRowId,row.sourceRowId)||
     !same(event.encounterId,row.encounterId)||
     event.sourceSyncVersion!==row.syncVersion||
     event.provider!==configuredProvider||
     !same(event.policyVersion,row.effectivePolicyVersion)||
     !UUID.test(event.eventId||'')||
     event.serverCommittedVerified!==true||
     event.explicitActionVerified!==true||
     event.scopeValidatedVerified!==true||
     event.revoked!==false||
     event.serverSequenceBeforeExternalDispatchVerified!==true)
   return stop('PURPOSE_SPECIFIC_DURABLE_CONSENT_NOT_VERIFIED');
  if(route==='submit-audit-case'){
   // Consent is never a substitute for the separate final physician ACK,
   // exact digest, version, source locks and transactional idempotency.
   if(row.finalPhysicianAckVerified!==true||
      row.exactDigestAndVersionVerified!==true||
      row.transactionalAuditAdmissionVerified!==true)
    return stop('AUDIT_FINAL_ACK_AND_TRANSACTION_REQUIRED');
  }
  const actorAgain=await identity.getUser();
  if(!same(actorAgain?.id,actor.id))
   return stop('ACTOR_CHANGED_BEFORE_EXTERNAL_DISPATCH');
  // NO upstream call, no clinical content, no event ID or digest exposed.
  // Even true values above may come from mocks: never treat them as proof.
  return Object.freeze({
   status:'ADMISSION_PREFLIGHT_CANDIDATE_ONLY',
   code:'TRUSTED_DEPLOYED_PRE_PROVIDER_GATE_NOT_PROVEN',
   route,purpose:policy.purpose,
   externalAiAuthorized:false,auditSubmitAuthorized:false,
   adminWriteAuthorized:false,clinicalPayloadReleased:false,
   gateCVerified:false,eventDurabilityVerified:false,
   resetAuthorized:false
  });
 }catch{
  return stop('PRE_PROVIDER_ADMISSION_FAIL_CLOSED');
 }
}


/*
 * BOOTSTRAP STAGE BEFORE FIRST AUDIO/RADAR EGRESS (LAB ONLY).
 *
 * The actual UI startRec() can start realtime after checking a browser checkbox,
 * without awaiting a persisted, owner-bound consultation: index.html 3881-3911.
 * Autosave startNew() creates a local row and launches syncOne() without await;
 * syncOne() skips an empty draft: nexa-encounter-autosave-v18.10.1.js
 * lines 231-232 and 338-354. No hosted handler is altered by this function.
 *
 * This is an additional PRECONDITION to inspectExternalAiAdmissionCandidate,
 * NOT an alternate admission service and NOT consent. A browser encounter UUID,
 * IndexedDB copy, fabricated serverAck, or positive mock can never create
 * durable authority. Any future server implementation must verify source
 * persistence under genuine owner credentials before first provider egress;
 * actual DB locks, consent events, revocation and live-session termination
 * remain separately unproven. The route is server-selected, never client input.
 */
export async function inspectPersistedEncounterBootstrapCandidate({
 route,request,identity,source
}={}){
 try{
  if(!['realtime-call.webrtc','realtime-call.chunk','realtime-radar'].includes(route))
   return stop('BOOTSTRAP_BACKEND_ROUTE_NOT_SUPPORTED');
  if(!plain(request)||Object.keys(request).length!==1||
     !own(request,'encounterId')||!UUID.test(request.encounterId||''))
   return stop('BOOTSTRAP_REQUEST_ROUTING_ONLY_REQUIRED');
  if(typeof identity?.getUser!=='function'||
     typeof source?.readOwnerScopedForActor!=='function')
   return stop('BOOTSTRAP_TRUSTED_SOURCE_ADAPTER_MISSING');
  const actor=await identity.getUser();
  if(!UUID.test(actor?.id||''))return stop('BOOTSTRAP_ACTOR_NOT_AUTHENTICATED');
  if(own(actor,'tenantId'))return stop('UNSUPPORTED_INSTITUTIONAL_TENANT_CLAIM');
  const row=await source.readOwnerScopedForActor({
   actorId:actor.id,encounterId:request.encounterId,route
  });
  if(!plain(row)||!UUID.test(row.sourceRowId||'')||
     !same(row.ownerUserId,actor.id)||
     !same(row.encounterId,request.encounterId)||
     !ver(row.syncVersion)||
     row.clinicalAccessVerified!==true||
     row.activeSlotVerified!==true)
   return stop('BOOTSTRAP_OWNER_OR_SOURCE_VERSION_NOT_VERIFIED');
  if(own(row,'tenantId')||own(row,'tenantMembershipVerified'))
   return stop('UNSUPPORTED_INSTITUTIONAL_TENANT_CLAIM');
  if(row.serverPersistedVerified!==true||
     row.serverSyncAckVerified!==true||
     row.ownerBindingVerified!==true||
     row.serverRowUniquenessVerified!==true||
     row.noPendingLocalEditsVerified!==true||
     row.sourceLockedVerified!==false||
     row.externalSessionAlreadyStartedVerified!==false)
   return stop('BOOTSTRAP_DURABLE_SOURCE_ACK_NOT_VERIFIED');
  const actorAgain=await identity.getUser();
  if(!same(actorAgain?.id,actor.id))
   return stop('BOOTSTRAP_ACTOR_CHANGED_BEFORE_EGRESS');
  // Only a planning classification. Mock-true flags are NOT DB evidence.
  // No purpose-specific consent was read, and no external session was started.
  return Object.freeze({
   status:'PERSISTED_ENCOUNTER_BOOTSTRAP_CANDIDATE_ONLY',
   code:'TRUSTED_SOURCE_CONSENT_AND_LIVE_REVOCATION_NOT_PROVEN',
   route,purpose:PROVIDER_GATE_ROUTES[route].purpose,
   externalAiAuthorized:false,auditSubmitAuthorized:false,
   adminWriteAuthorized:false,clinicalPayloadReleased:false,
   gateCVerified:false,eventDurabilityVerified:false,
   resetAuthorized:false
  });
 }catch{
  return stop('BOOTSTRAP_FAIL_CLOSED');
 }
}
