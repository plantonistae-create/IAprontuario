import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { validateSpeakerSegments } from "../_shared/nexa-speaker-contract.mjs";

// Optional, isolated first stage. Never persists consultation audio or speaker transcripts.
// The UI only calls this before the existing medical documentation pipeline.
const url = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
const allowed = Deno.env.get("ALLOWED_ORIGIN") || "https://plantonistae-create.github.io";
const model = Deno.env.get("NEXA_DIARIZATION_MODEL") || "gpt-4o-transcribe-diarize";

function headers(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === allowed ? origin : "",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
}
function response(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {status, headers:headers(req)});
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, {status:204, headers:headers(req)});
  if (req.method !== "POST") return response(req,{error:"METHOD_NOT_ALLOWED"},405);
  if (req.headers.get("Origin") !== allowed) return response(req,{error:"ORIGIN_FORBIDDEN"},403);
  const token = req.headers.get("Authorization") || "";
  if (!token.startsWith("Bearer ")) return response(req,{error:"UNAUTHORIZED"},401);
  const client = createClient(url,anonKey,{global:{headers:{Authorization:token}}});
  const {data:{user},error} = await client.auth.getUser();
  if (error || !user) return response(req,{error:"UNAUTHORIZED"},401);
  const {data:caps,error:capError} = await client.rpc("get_my_capabilities");
  const cap = Array.isArray(caps) ? caps[0] : caps;
  if (capError || !cap || cap.access_status !== "active" || !cap.clinical_access) {
    return response(req,{error:"CLINICAL_ACCESS_REQUIRED"},403);
  }
  if (!apiKey) return response(req,{error:"DIARIZATION_NOT_CONFIGURED"},503);
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || !audio.size) return response(req,{error:"AUDIO_REQUIRED"},400);
    if (audio.size > 24*1024*1024) return response(req,{error:"AUDIO_TOO_LARGE"},413);
    const upstreamForm = new FormData();
    upstreamForm.set("file",audio,audio.name || "consulta.webm");
    upstreamForm.set("model",model);
    upstreamForm.set("response_format","diarized_json");
    upstreamForm.set("chunking_strategy","auto");
    upstreamForm.set("language","pt");
    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions",{
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`},
      body:upstreamForm,
      signal:AbortSignal.timeout(170000)
    });
    if (!upstream.ok) return response(req,{error:"DIARIZATION_UPSTREAM_FAILED",status:upstream.status},502);
    const output = await upstream.json();
    const segments = validateSpeakerSegments(output?.segments);
    // Speaker labels are anonymous and their roles still require physician confirmation.
    return response(req,{
      schema_version:"speaker-diarization-v1",
      segments,
      duration_seconds:Number(output?.duration || 0),
      model,
      role_confirmation_required:true,
      audio_retained:false
    });
  } catch (e) {
    // Never log raw audio, provider response, transcript, or personal data.
    return response(req,{error:e instanceof DOMException && e.name==="TimeoutError"?"DIARIZATION_TIMEOUT":"DIARIZATION_FAILED"},502);
  }
});
