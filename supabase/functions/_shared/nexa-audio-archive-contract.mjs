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
export async function executeAudioArchive({actor,request,source,grant,bucket,storage,hashBlob}){
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
  const receipt={schema_version:'nexa-audio-archive-v1',archived:true,
    audio_id:path,sha256:cmd.sha256,size_bytes:cmd.size_bytes,
    encounter_id:cmd.encounter_id,retention_grant_id:cmd.retention_grant_id,
    owner_verified:true,server_readback_verified:true,training_approved:false};
  if(cmd.action==='confirm')return {status:200,body:receipt};
  // Do not mint a reusable download URL: it would remain valid after revocation.
  // The HTTP adapter must recheck the grant and deliver this verified Blob
  // only in the authenticated response, with Cache-Control: no-store.
  return {status:200,body:{...receipt,method:'authenticated_stream'},audio};
}
