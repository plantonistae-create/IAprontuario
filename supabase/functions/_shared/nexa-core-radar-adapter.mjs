import {buildRadarEvidencePlan} from "./nexa-radar-evidence-library.mjs";
// NEXA Core Radar API contract v1.
// Used by Supabase Edge Function only; no client or patient identifiers sent.
export const RADAR_API_CONTRACT = "nexa-core-radar-v1";

export function resolveCoreRadarEndpoint(value) {
  if (!value || typeof value !== "string") throw new Error("NEXA_CORE_RADAR_NOT_CONFIGURED");
  let url;
  try { url = new URL(value); } catch { throw new Error("NEXA_CORE_RADAR_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !url.hostname || url.port || /^(localhost|.*\.localhost)$/i.test(url.hostname) ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || url.hostname.includes(":")) {
    throw new Error("NEXA_CORE_RADAR_URL_INVALID");
  }
  if (!/^\/v1\/radar\/analyze\/?$/.test(url.pathname)) throw new Error("NEXA_CORE_RADAR_PATH_INVALID");
  return url.toString();
}

/** @param {{transcript?:string,fields?:Record<string,unknown>,previous?:Record<string,unknown>,conceptIds?:string[],model?:string}} options */
export function createCoreRadarRequest({transcript="",fields={},previous={},conceptIds=[],model=""}) {
  if (typeof transcript !== "string" || transcript.length > 45000 ||
      !fields || typeof fields !== "object" || Array.isArray(fields) ||
      !previous || typeof previous !== "object" || Array.isArray(previous) ||
      !Array.isArray(conceptIds) || conceptIds.length > 150 ||
      conceptIds.some(x=>typeof x !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]{0,64}$/.test(x))) {
    throw new Error("NEXA_CORE_RADAR_INPUT_INVALID");
  }
  const request = {
    schema_version: RADAR_API_CONTRACT,
    capability: "realtime.radar",
    model: String(model||"nexa-core-radar").slice(0,80),
    context: {transcript,clinical_context:fields,previous_state:previous},
    allowed_concepts: conceptIds,
    // Same public source index used by OpenAI and the future independent NEXA Core.
    // Only source IDs/URLs and objectives; no patient excerpts copied into this metadata.
    evidence_context: buildRadarEvidencePlan({fields,transcript,allowedConcepts:conceptIds}),
    constraints: {
      no_inferred_negatives: true,
      evidence_must_be_literal: true,
      third_party_is_not_patient: true,
      doctor_question_is_not_patient_response: true,
      human_decision_is_final: true
    }
  };
  if (JSON.stringify(request).length > 60000) throw new Error("NEXA_CORE_RADAR_INPUT_TOO_LARGE");
  return request;
}

export async function requestCoreRadar({url,apiKey,payload,fetchImpl=fetch,signal}){
  const endpoint=resolveCoreRadarEndpoint(url);
  if (!apiKey || typeof apiKey !== "string" || apiKey.length < 24) {
    throw new Error("NEXA_CORE_RADAR_AUTH_NOT_CONFIGURED");
  }
  const response=await fetchImpl(endpoint,{
    method:"POST",
    headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify(payload),
    redirect:"error",
    signal
  });
  if (!response.ok) throw new Error("NEXA_CORE_RADAR_UPSTREAM_FAILED");
  // Limit size before JSON parse: clinical content should never be sent to logs.
  const text=await response.text();
  if(text.length > 80000) throw new Error("NEXA_CORE_RADAR_RESPONSE_TOO_LARGE");
  let parsed;
  try {parsed=JSON.parse(text)} catch {throw new Error("NEXA_CORE_RADAR_INVALID_JSON")}
  if(parsed?.schema_version !== RADAR_API_CONTRACT ||
     !parsed?.result || typeof parsed.result !== "object" || Array.isArray(parsed.result) ||
     !Array.isArray(parsed.result.items) || !Array.isArray(parsed.result.observations)) {
    throw new Error("NEXA_CORE_RADAR_CONTRACT_INVALID");
  }
  return parsed.result;
}
