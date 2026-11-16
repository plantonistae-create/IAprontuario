// NEXA Core P0: private clinical audio archive protocol. No implicit training rights.
// This module does not access a network or Supabase; adapters must be authenticated.
export const ARCHIVE_BUCKET = 'nexa-private-clinical-audio';
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const TYPES = Object.freeze({'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/wav':'wav','audio/x-wav':'wav'});
const ACTIONS = new Set(['prepare','confirm','retrieve']);

export class ArchiveError extends Error {
  constructor(code,status){super(code);this.name='ArchiveError';this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new ArchiveError(code,status)};
export function parseArchiveRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_REQUEST',400);
  const {action,encounter_id,client_action_id,retention_grant_id,sha256,size_bytes,mime_type}=input;
  if(!ACTIONS.has(action))fail('INVALID_ACTION',400);
  for(const value of [encounter_id,client_action_id,retention_grant_id]){
    if(typeof value!=='string'||!UUID.test(value))fail('INVALID_IDENTIFIER',400);
  }
  if(typeof sha256!=='string'||!HASH.test(sha256))fail('INVALID_SHA256',400);
  if(!Number.isSafeInteger(size_bytes)||size_bytes<1||size_bytes>MAX_AUDIO_BYTES)fail('INVALID_AUDIO_SIZE',400);
  if(!Object.hasOwn(TYPES,mime_type))fail('INVALID_AUDIO_TYPE',400);
  return Object.freeze({action,encounter_id:encounter_id.toLowerCase(),
    client_action_id:client_action_id.toLowerCase(),
    retention_grant_id:retention_grant_id.toLowerCase(),
    sha256,size_bytes,mime_type,extension:TYPES[mime_type]});
}
export function archivePaths(actor,request){
  if(!UUID.test(actor))fail('UNAUTHORIZED',401);
  const directory=[actor.toLowerCase(),request.encounter_id,request.retention_grant_id,request.client_action_id].join('/');
  const name=request.sha256+'.'+request.extension;
  return Object.freeze({directory,path:directory+'/'+name,name});
}
// A successful readback is NOT an archived case until an independently
// persisted, immutable receipt matches every field supplied by this server.
// The receiptStore adapter must only use server-only database permissions.
function receiptMatches(saved,expected){
  return !!saved&&typeof saved==='object'&&UUID.test(saved.receipt_id||'')&&
    saved.owner_user_id===expected.owner_user_id&&
    saved.encounter_id===expected.encounter_id&&
    saved.client_action_id===expected.client_action_id&&
    saved.retention_grant_id===expected.retention_grant_id&&
    saved.object_path===expected.object_path&&
    saved.sha256===expected.sha256&&
    saved.size_bytes===expected.size_bytes&&
    saved.mime_type===expected.mime_type&&
    saved.policy_version===expected.policy_version&&
    saved.purpose==='clinical_audio_retention'&&
    typeof saved.committed_at==='string'&&Number.isFinite(Date.parse(saved.committed_at));
}
export async function executeAudioArchive({actor,request,source,grant,bucket,storage,hashBlob,receiptStore}){
  const cmd=parseArchiveRequest(request);
  if(typeof actor!=='string'||!UUID.test(actor))fail('UNAUTHORIZED',401);
  // All checks repeat on every action, including retrieval; no implicit cross-owner access.
  if(!source||source.user_id!==actor.toLowerCase()||source.encounter_id!==cmd.encounter_id)
    fail('SOURCE_NOT_OWNED_OR_UNAVAILABLE',403);
  if(!grant||grant.active!==true||grant.owner_user_id!==actor.toLowerCase()||
      grant.encounter_id!==cmd.encounter_id||grant.grant_id!==cmd.retention_grant_id||
      grant.purpose!=='clinical_audio_retention'||grant.server_verified!==true||
      grant.revoked_at!==null||
      typeof grant.policy_version!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/).test(grant.policy_version)||
      typeof grant.expires_at!=='string'||!Number.isFinite(Date.parse(grant.expires_at))||
      Date.parse(grant.expires_at)<=Date.now())
    fail('RETENTION_GRANT_NOT_VERIFIED',423);
  if(!bucket||bucket.id!==ARCHIVE_BUCKET||bucket.public!==false)fail('PRIVATE_BUCKET_NOT_PROVEN',503);
  // Private alone does not prove type/size restrictions on unauthenticated
  // signed uploads. Require explicit bucket-level limits before issuing tokens.
  const bucketMax=Number(bucket.file_size_limit);
  if(!Array.isArray(bucket.allowed_mime_types)||!bucket.allowed_mime_types.length||
     !bucket.allowed_mime_types.includes(cmd.mime_type)||
     !Number.isSafeInteger(bucketMax)||bucketMax<1||bucketMax>MAX_AUDIO_BYTES)
    fail('BUCKET_RESTRICTIONS_NOT_PROVEN',503);
  if(cmd.size_bytes>bucketMax)fail('AUDIO_TOO_LARGE_FOR_BUCKET',413);
  const {directory,path,name}=archivePaths(actor,cmd);
  const entries=await storage.list(directory);
  if(!Array.isArray(entries))fail('STORAGE_LIST_UNAVAILABLE',503);
  // An action ID may never be bound to multiple object names, even after a race.
  const others=entries.filter(x=>x&&typeof x.name==='string');
  if(others.some(x=>x.name!==name)||others.length>1)fail('ACTION_ID_CONFLICT',409);
  if(cmd.action==='prepare'){
    if(others.length) return {status:409,body:{error:'ALREADY_UPLOADED_CONFIRM_FIRST'}};
    // A signed upload token survives consent revocation for up to two hours.
    // Instead, the authenticated user's Storage INSERT must be checked by
    // a verified owner/encounter/grant RLS policy at upload time.
    // No signed upload token or service-role credential is ever returned.
    return {status:200,body:{schema_version:'nexa-audio-archive-v1',upload_path:path,
      method:'authenticated_direct_upload',upsert:false,requires_owner_rls:true,
      max_bytes:bucketMax,archived:false,upload_pending:true,
      consent_for_training:false}};
  }
  if(others.length!==1)fail('AUDIO_NOT_UPLOADED',404);
  const audio=await storage.download(path);
  if(!audio||typeof hashBlob!=='function')fail('READBACK_UNAVAILABLE',503);
  const observed=await hashBlob(audio);
  if(!observed||observed.sha256!==cmd.sha256||observed.size_bytes!==cmd.size_bytes)
    fail('AUDIO_INTEGRITY_MISMATCH',409);
  // A server-held readback must precede ANY attempt to write a receipt.
  const expected=Object.freeze({
    owner_user_id:actor.toLowerCase(),encounter_id:cmd.encounter_id,
    client_action_id:cmd.client_action_id,retention_grant_id:cmd.retention_grant_id,
    object_path:path,sha256:cmd.sha256,size_bytes:cmd.size_bytes,
    mime_type:cmd.mime_type,policy_version:grant.policy_version
  });
  if(!receiptStore||typeof receiptStore.commitVerified!=='function'||
      typeof receiptStore.readCommitted!=='function')
    fail('DURABLE_RECEIPT_STORE_UNAVAILABLE',503);
  // The SQL commit RPC checks source ownership and locks the active retention
  // grant inside the SAME transaction as the immutable receipt insert.
  const saved=cmd.action==='confirm'
    ?await receiptStore.commitVerified(expected)
    :await receiptStore.readCommitted(expected);
  if(!receiptMatches(saved,expected))
    fail(cmd.action==='confirm'?'DURABLE_RECEIPT_NOT_CONFIRMED':'DURABLE_RECEIPT_NOT_FOUND',
      cmd.action==='confirm'?503:409);
  const receipt={schema_version:'nexa-audio-archive-v1',archived:true,
    receipt_id:saved.receipt_id,committed_at:saved.committed_at,
    audio_id:path,sha256:cmd.sha256,size_bytes:cmd.size_bytes,
    encounter_id:cmd.encounter_id,retention_grant_id:cmd.retention_grant_id,
    owner_verified:true,server_readback_verified:true,
    durable_receipt_verified:true,training_approved:false};
  if(cmd.action==='confirm')return {status:200,body:receipt};
  // The HTTP adapter still checks the grant again before delivering bytes.
  return {status:200,body:{...receipt,method:'authenticated_stream'},audio};
}
