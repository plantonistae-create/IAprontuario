'use strict';
// TEST-ONLY mock of the textual readback contract described for backend PR #181 (no backend file is imported).
// Request : POST { encounter_id: uuid, expected_sync_version: integer >= 0, expected_sha256?: 64 hex } (no other key)
// Response: { verified:true, canonical_sha256, package:{...current server version...}, durable_archive:false, audio_included:false }
// Errors  : 400 INVALID_*, 401 UNAUTHORIZED, 403 CLINICAL_ACCESS_REQUIRED / OWNER_SCOPE_VIOLATION, 404 SOURCE_NOT_FOUND,
//           409 SOURCE_INVALID / SOURCE_VERSION_CHANGED / SOURCE_CONTENT_MISMATCH, 503 READBACK_UNAVAILABLE / HASH_NOT_VERIFIED
// The package carries text only: never audio, never a durable archive.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256=/^[a-f0-9]{64}$/;
class ContractError extends Error{constructor(code,status){super(code);this.name='TextReadbackError';this.code=code;this.status=status}}
const fail=(code,status)=>{throw new ContractError(code,status)};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

function parseRequest(input){
  if(!isObj(input)||Object.keys(input).some(k=>!['encounter_id','expected_sync_version','expected_sha256'].includes(k)))fail('INVALID_REQUEST',400);
  if(typeof input.encounter_id!=='string'||!UUID.test(input.encounter_id))fail('INVALID_ENCOUNTER_ID',400);
  if(!Number.isSafeInteger(input.expected_sync_version)||input.expected_sync_version<0)fail('INVALID_EXPECTED_VERSION',400);
  if(input.expected_sha256!==undefined&&(typeof input.expected_sha256!=='string'||!SHA256.test(input.expected_sha256)))fail('INVALID_EXPECTED_SHA256',400);
  return{encounter_id:input.encounter_id.toLowerCase(),expected_sync_version:input.expected_sync_version,expected_sha256:input.expected_sha256??null};
}
function canonicalJson(v){
  if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']';
  if(isObj(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}';
  fail('NON_JSON_PACKAGE',422);
}
async function readVerifiedTextPackage({actor,capability,request,lookup,hashCanonical}){
  const cmd=parseRequest(request);
  if(typeof actor!=='string'||!UUID.test(actor))fail('UNAUTHORIZED',401);
  const owner=actor.toLowerCase();
  if(!capability||capability.access_status!=='active'||capability.clinical_access!==true)fail('CLINICAL_ACCESS_REQUIRED',403);
  if(typeof lookup!=='function'||typeof hashCanonical!=='function')fail('READBACK_UNAVAILABLE',503);
  const source=await lookup({owner,encounter_id:cmd.encounter_id});
  if(!source)fail('SOURCE_NOT_FOUND',404);
  if(source.user_id!==owner||source.encounter_id!==cmd.encounter_id)fail('OWNER_SCOPE_VIOLATION',403);
  if(!Number.isSafeInteger(source.sync_version)||source.sync_version<0||!isObj(source.fields))fail('SOURCE_INVALID',409);
  if(source.sync_version!==cmd.expected_sync_version)fail('SOURCE_VERSION_CHANGED',409);
  const pkg={schema_version:'nexa-clinical-text-readback-v1',encounter_id:source.encounter_id,sync_version:source.sync_version,
    updated_at:source.updated_at??null,encounter_state:source.encounter_state??null,consent_recorded_at:source.consent_recorded_at??null,
    fields:source.fields,processing_meta:isObj(source.processing_meta)?source.processing_meta:{},protocol_usage:Array.isArray(source.protocol_usage)?source.protocol_usage:[]};
  const sha256=await hashCanonical(canonicalJson(pkg));
  if(typeof sha256!=='string'||!SHA256.test(sha256))fail('HASH_NOT_VERIFIED',503);
  if(cmd.expected_sha256!==null&&cmd.expected_sha256!==sha256)fail('SOURCE_CONTENT_MISMATCH',409);
  return{verified:true,canonical_sha256:sha256,package:pkg,durable_archive:false,audio_included:false};
}
module.exports={readVerifiedTextPackage,canonicalJson,parseRequest,TextReadbackError:ContractError};
