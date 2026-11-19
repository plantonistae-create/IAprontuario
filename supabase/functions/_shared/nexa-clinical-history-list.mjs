// V4.36 candidate: RLS-backed, owner-only, cross-device CONSULTATION INDEX.
// No clinical content in list responses, no writes, no secondary-use authority.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const allowed=new Set(['action','limit','from_utc','until_utc','cursor']);
export class HistoryListError extends Error {
  constructor(code,status){super(code);this.name='HistoryListError';this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new HistoryListError(code,status);};
const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function timestamp(value){
  return typeof value==='string'&&value.length<=40&&ISO.test(value)&&Number.isFinite(Date.parse(value));
}
function uuid(value){return typeof value==='string'&&UUID.test(value);}
export function parseHistoryListRequest(value){
  if(!obj(value)||Object.keys(value).some(k=>!allowed.has(k))||value.action!=='list')
    fail('INVALID_HISTORY_REQUEST',400);
  const limit=value.limit===undefined?25:value.limit;
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('INVALID_HISTORY_LIMIT',400);
  if(value.from_utc!==undefined&&!timestamp(value.from_utc))fail('INVALID_HISTORY_WINDOW',400);
  if(value.until_utc!==undefined&&!timestamp(value.until_utc))fail('INVALID_HISTORY_WINDOW',400);
  if(value.from_utc&&value.until_utc&&Date.parse(value.from_utc)>=Date.parse(value.until_utc))
    fail('INVALID_HISTORY_WINDOW',400);
  let cursor=null;
  if(value.cursor!==undefined&&value.cursor!==null){
    if(!obj(value.cursor)||Object.keys(value.cursor).sort().join(',')!=='created_at,id'||
       !timestamp(value.cursor.created_at)||!uuid(value.cursor.id))
      fail('INVALID_HISTORY_CURSOR',400);
    cursor={created_at:value.cursor.created_at,id:value.cursor.id.toLowerCase()};
  }
  return Object.freeze({limit,from_utc:value.from_utc??null,until_utc:value.until_utc??null,cursor});
}
export async function listOwnedHistory({actor,capability,request,listRows}){
  const cmd=parseHistoryListRequest(request);
  if(!uuid(actor))fail('UNAUTHORIZED',401);
  const owner=actor.toLowerCase();
  if(!capability||!uuid(capability.id)||capability.id.toLowerCase()!==owner||
     capability.access_status!=='active'||capability.clinical_access!==true)
    fail('CLINICAL_ACCESS_REQUIRED',403);
  if(typeof listRows!=='function')fail('HISTORY_LIST_UNAVAILABLE',503);
  const rows=await listRows({owner,...cmd});
  if(!Array.isArray(rows)||rows.length>cmd.limit+1)fail('HISTORY_LIST_INVALID',503);
  const entries=rows.slice(0,cmd.limit).map(row=>{
    if(!obj(row)||row.user_id!==owner||!uuid(row.id)||!uuid(row.encounter_id)||
       !timestamp(row.created_at)||!timestamp(row.updated_at)||
       !Number.isSafeInteger(row.sync_version)||row.sync_version<0||
       !['draft','final'].includes(row.status)||
       !['draft','ready_for_audit','audited','discarded'].includes(row.encounter_state))
      fail('HISTORY_ROW_NOT_VERIFIED',409);
    return Object.freeze({
      encounter_id:row.encounter_id.toLowerCase(),record_id:row.id.toLowerCase(),
      created_at:row.created_at,updated_at:row.updated_at,sync_version:row.sync_version,
      status:row.status,encounter_state:row.encounter_state
    });
  });
  // A cursor is a navigation token, NOT an authorization token.
  // The HTTP adapter must enforce the same JWT/RLS owner on every page.
  const last=entries.at(-1);
  return {
    schema_version:'nexa-clinical-history-list-v1',
    items:entries,
    has_more:rows.length>cmd.limit,
    next_cursor:rows.length>cmd.limit&&last?{created_at:last.created_at,id:last.record_id}:null,
    scope:'authenticated_owner_only',
    content_included:false,audio_included:false,training_approved:false,
    note:'Index only. Read each current text version through verified readback; immutable archive not proven.'
  };
}
