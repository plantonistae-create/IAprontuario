import {createClient} from "npm:@supabase/supabase-js@2.49.8";
import {createHash} from "node:crypto";
import {ARCHIVE_BUCKET,ArchiveError,executeAudioArchive,parseArchiveRequest} from "../_shared/nexa-audio-archive-contract.mjs";

// REVIEW CANDIDATE ONLY. Not deployed. Requires an independently approved
// clinical_audio_retention authority, a private Storage bucket and security gate.
// Feature is disabled unless explicitly enabled after those proofs.
const url=Deno.env.get("SUPABASE_URL")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const origin=Deno.env.get("ALLOWED_ORIGIN")||"https://plantonistae-create.github.io";
const enabled=Deno.env.get("NEXA_AUDIO_ARCHIVE_ENABLED")==="true";
// Separate gate for independently reviewed Storage INSERT RLS, not an RLS substitute.
const rlsReady=Deno.env.get("NEXA_AUDIO_DIRECT_RLS_READY")==="verified-v1";
const headers=(req:Request)=>({
  "Access-Control-Allow-Origin":req.headers.get("Origin")===origin?origin:"",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type",
  "Content-Type":"application/json","Cache-Control":"no-store",Vary:"Origin"
});
const json=(req:Request,status:number,body:unknown)=>
  new Response(JSON.stringify(body),{status,headers:headers(req)});
async function smallJsonBody(req:Request){
  if(!req.body)throw new ArchiveError("INVALID_REQUEST",400);
  const chunks:Uint8Array[]=[];let size=0;
  for await(const part of req.body){
    size+=part.byteLength;
    if(size>4096)throw new ArchiveError("REQUEST_TOO_LARGE",413);
    chunks.push(part);
  }
  const payload=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){payload.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(payload));}
  catch{throw new ArchiveError("INVALID_JSON",400);}
}
async function verifiedDigest(blob:Blob){
  const hash=createHash("sha256");let size=0;
  for await(const part of blob.stream()){
    size+=part.byteLength;
    if(size>100*1024*1024)throw new ArchiveError("AUDIO_TOO_LARGE",413);
    hash.update(part);
  }
  return{sha256:hash.digest("hex"),size_bytes:size};
}
Deno.serve(async(req:Request)=>{
  if(req.headers.get("Origin")!==origin)return json(req,403,{error:"ORIGIN_FORBIDDEN"});
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(req)});
  if(req.method!=="POST")return json(req,405,{error:"METHOD_NOT_ALLOWED"});
  if(!enabled)return json(req,423,{error:"ARCHIVE_NOT_AUTHORIZED_FOR_DEPLOYMENT"});
  if(!rlsReady)return json(req,423,{error:"STORAGE_OWNER_RLS_NOT_VERIFIED"});
  if(!url||!anon||!secret)return json(req,503,{error:"ARCHIVE_CONFIGURATION_INCOMPLETE"});
  const auth=req.headers.get("Authorization")||"";
  if(!/^Bearer \S+$/.test(auth))return json(req,401,{error:"UNAUTHORIZED"});
  if(Number(req.headers.get("content-length")||"0")>4096)return json(req,413,{error:"REQUEST_TOO_LARGE"});
  try{
    const userClient=createClient(url,anon,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:auth}}
    });
    const {data:{user},error:authError}=await userClient.auth.getUser();
    if(authError||!user)return json(req,401,{error:"UNAUTHORIZED"});
    const {data:caps,error:capError}=await userClient.rpc("get_my_capabilities");
    const cap=Array.isArray(caps)?caps[0]:caps;
    if(capError||cap?.access_status!=="active"||cap?.clinical_access!==true)
      return json(req,403,{error:"CLINICAL_ACCESS_REQUIRED"});
    const cmd=parseArchiveRequest(await smallJsonBody(req));
    const {data:source,error:sourceError}=await userClient.from("consultation_history")
      .select("id,encounter_id,user_id,sync_version")
      .eq("encounter_id",cmd.encounter_id).eq("user_id",user.id).maybeSingle();
    if(sourceError||!source)return json(req,403,{error:"SOURCE_NOT_OWNED_OR_UNAVAILABLE"});
    // This RPC is deliberately NOT created by this Sprint. It must be backed
    // by an approved authoritative retention grant, not a browser checkbox.
    // Missing RPC, pending Gate C, or inaccessible grant => hard deny.
    const {data:grantRow,error:grantError}=await userClient.rpc(
      "nexa_audio_retention_authority",
      {p_encounter_id:cmd.encounter_id,p_grant_id:cmd.retention_grant_id}
    );
    if(grantError)return json(req,423,{error:"RETENTION_GRANT_NOT_VERIFIED"});
    const grant=Array.isArray(grantRow)?grantRow[0]:grantRow;
    if(!grant||grant.active!==true||grant.server_verified!==true||
      grant.owner_user_id!==user.id||grant.encounter_id!==cmd.encounter_id||
      grant.grant_id!==cmd.retention_grant_id||
      grant.purpose!=="clinical_audio_retention"||
      grant.revoked_at!==null||
      typeof grant.policy_version!=="string"||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(grant.policy_version)||
      typeof grant.expires_at!=="string"||
      !Number.isFinite(Date.parse(grant.expires_at))||
      Date.parse(grant.expires_at)<=Date.now())
      return json(req,423,{error:"RETENTION_GRANT_NOT_VERIFIED"});
    // Only after independent Auth + RLS ownership + retention-grant checks.
    // service_role bypasses Storage RLS; never use it as authorization.
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:bucket,error:bucketError}=await admin.storage.getBucket(ARCHIVE_BUCKET);
    if(bucketError||!bucket||bucket.public!==false)
      return json(req,503,{error:"PRIVATE_BUCKET_NOT_PROVEN"});
    const store=admin.storage.from(ARCHIVE_BUCKET);
    const storage={
      async list(dir:string){
        const {data,error}=await store.list(dir,{limit:100});
        if(error||!data)throw new ArchiveError("STORAGE_LIST_UNAVAILABLE",503);
        if(data.length===100)throw new ArchiveError("STORAGE_LIST_INCOMPLETE",409);
        return data;
      },
      async download(path:string){
        const {data,error}=await store.download(path);
        if(error||!data)throw new ArchiveError("READBACK_UNAVAILABLE",503);
        return data;
      },
    };
    // This service-role RPC is a privileged RECEIPT writer, NOT consent issuance.
    // The user JWT has already been verified and the DB RPC repeats ownership,
    // active retention authority (under row lock) and Storage object existence.
    // No archived:true response is allowed without the immutable DB receipt.
    const receiptFields="receipt_id,owner_user_id,encounter_id,client_action_id,retention_grant_id,object_path,sha256,size_bytes,mime_type,policy_version,purpose,committed_at";
    const unwrapReceipt=(data:unknown)=>{
      const row=Array.isArray(data)?data[0]:data;
      if(!row||typeof row!=="object")return null;
      const value=row as Record<string,unknown>;
      const n=Number(value.size_bytes);
      if(!Number.isSafeInteger(n))return null;
      return {...value,size_bytes:n};
    };
    const receiptStore={
      async commitVerified(expected:Record<string,unknown>){
        const {data,error}=await admin.rpc("nexa_audio_commit_verified_receipt",{
          p_owner_user_id:expected.owner_user_id,
          p_encounter_id:expected.encounter_id,
          p_client_action_id:expected.client_action_id,
          p_retention_grant_id:expected.retention_grant_id,
          p_object_path:expected.object_path,
          p_sha256:expected.sha256,
          p_size_bytes:expected.size_bytes,
          p_mime_type:expected.mime_type,
          p_policy_version:expected.policy_version
        });
        if(error)throw new ArchiveError("DURABLE_RECEIPT_COMMIT_FAILED",503);
        return unwrapReceipt(data);
      },
      async readCommitted(expected:Record<string,unknown>){
        const {data,error}=await admin.from("nexa_audio_archive_receipts")
          .select(receiptFields).eq("owner_user_id",String(expected.owner_user_id))
          .eq("encounter_id",String(expected.encounter_id))
          .eq("client_action_id",String(expected.client_action_id))
          .maybeSingle();
        if(error)throw new ArchiveError("DURABLE_RECEIPT_READ_FAILED",503);
        return unwrapReceipt(data);
      }
    };
    const result=await executeAudioArchive({
      actor:user.id,request:cmd,source,grant,bucket,storage,
      hashBlob:verifiedDigest,receiptStore
    });

    if(cmd.action==="retrieve"){
      // The source/blob was verified by the contract. A second authority read
      // narrows the revoke-vs-download race after potentially slow readback.
      if(!("audio" in result)||!(result.audio instanceof Blob))
        return json(req,503,{error:"READBACK_UNAVAILABLE"});
      const {data:latestRows,error:latestError}=await userClient.rpc(
        "nexa_audio_retention_authority",
        {p_encounter_id:cmd.encounter_id,p_grant_id:cmd.retention_grant_id}
      );
      const latest=Array.isArray(latestRows)?latestRows[0]:latestRows;
      if(latestError||!latest||latest.owner_user_id!==user.id||
        latest.encounter_id!==cmd.encounter_id||
        latest.grant_id!==cmd.retention_grant_id||
        latest.purpose!=="clinical_audio_retention"||
        typeof latest.policy_version!=="string"||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(latest.policy_version)||
        latest.active!==true||latest.server_verified!==true||
        latest.revoked_at!==null||
        typeof latest.expires_at!=="string"||
        !Number.isFinite(Date.parse(latest.expires_at))||
        Date.parse(latest.expires_at)<=Date.now())
        return json(req,423,{error:"RETENTION_GRANT_NOT_VERIFIED"});
      return new Response(result.audio,{status:200,headers:{
        ...headers(req),
        "Content-Type":cmd.mime_type,
        "X-Nexa-Audio-Sha256":cmd.sha256,
        "X-Nexa-Audio-Size-Bytes":String(cmd.size_bytes),
        "Access-Control-Expose-Headers":"X-Nexa-Audio-Sha256, X-Nexa-Audio-Size-Bytes",
        "Content-Disposition":`attachment; filename="consulta-audio.${cmd.extension}"`
      }});
    }
    return json(req,result.status,result.body);
  }catch(error){
    if(error instanceof ArchiveError)return json(req,error.status,{error:error.code});
    // No clinical text, audio, tokens, exception details or URLs in logs.
    return json(req,503,{error:"ARCHIVE_OPERATION_FAILED"});
  }
});
