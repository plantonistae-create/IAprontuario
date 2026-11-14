// NEXA P0 prospective source-action writer — source-only Draft candidate.
// NOT DEPLOYED. STOP is unconditional; no frontend or egress integration.
// Reuses the explicit gesture boundary in #167 and pg-jsonb-v1 from #165.
// This function NEVER calls a model, handles clinical uploads or sends audit.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://plantonistae-create.github.io";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const plain = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
const exact = (x: unknown, keys: string[]): x is Record<string, unknown> =>
  plain(x) && Object.keys(x).length === keys.length &&
  keys.every(k => Object.prototype.hasOwnProperty.call(x, k));
const version = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) > 0;
const validId = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

// No environment flag, request header, frontend assertion or CI can lift this.
// A future authorized Gate C change must be separately reviewed before deploy.
const DEPLOYED_SOURCE_ACTION_WRITER_AUTHORIZED = false;

type RpcRequest = {
  p_kind: "consent" | "review" | "revoke";
  p_encounter: string;
  p_action_id: string;
  p_expected_sync_version: number | null;
  p_displayed_digest: string | null;
  p_purpose: string | null;
  p_provider: string | null;
  p_policy_version: string | null;
  p_explicit_confirmation: true;
  p_patient_scope_attested: boolean;
};

function decodeRequest(body: unknown):
  { kind: "prepare"; encounter: string } |
  { kind: "record"; params: RpcRequest } | null {
  if (!plain(body) || !validId(body.encounterId)) return null;
  if (body.action === "prepare_review") {
    if (!exact(body, ["action", "encounterId"])) return null;
    return { kind: "prepare", encounter: body.encounterId };
  }
  const common = ["action", "encounterId", "actionId", "confirmation"];
  if (!validId(body.actionId)) return null;

  if (body.action === "attest_consent") {
    if (!exact(body, [...common, "expectedSyncVersion", "displayedDigest",
      "purpose", "provider", "policyVersion"]) ||
      !version(body.expectedSyncVersion) ||
      typeof body.displayedDigest !== "string" || !DIGEST.test(body.displayedDigest) ||
      !["realtime_audio", "radar_context", "audio_diarization",
        "final_documentation", "audit_deidentification"].includes(String(body.purpose)) ||
      !["openai", "gemini", "nexa-core"].includes(String(body.provider)) ||
      typeof body.policyVersion !== "string" ||
      !/^[\w.-]{3,80}$/.test(body.policyVersion) ||
      !exact(body.confirmation,
        ["physicianAttestsPatientScope", "explicitlyConfirmsPurpose"]) ||
      body.confirmation.physicianAttestsPatientScope !== true ||
      body.confirmation.explicitlyConfirmsPurpose !== true) return null;
    return {
      kind: "record",
      params: {
        p_kind: "consent", p_encounter: body.encounterId,
        p_action_id: body.actionId,
        p_expected_sync_version: body.expectedSyncVersion,
        p_displayed_digest: body.displayedDigest,
        p_purpose: body.purpose as string,
        p_provider: body.provider as string,
        p_policy_version: body.policyVersion,
        p_explicit_confirmation: true,
        p_patient_scope_attested: true,
      },
    };
  }
  if (body.action === "ack_final_review") {
    if (!exact(body, [...common, "expectedSyncVersion", "displayedDigest"]) ||
      !version(body.expectedSyncVersion) ||
      typeof body.displayedDigest !== "string" || !DIGEST.test(body.displayedDigest) ||
      !exact(body.confirmation, ["physicianReviewedPersistedSnapshot"]) ||
      body.confirmation.physicianReviewedPersistedSnapshot !== true) return null;
    return {
      kind: "record",
      params: {
        p_kind: "review", p_encounter: body.encounterId,
        p_action_id: body.actionId,
        p_expected_sync_version: body.expectedSyncVersion,
        p_displayed_digest: body.displayedDigest,
        p_purpose: null, p_provider: null, p_policy_version: null,
        p_explicit_confirmation: true, p_patient_scope_attested: false,
      },
    };
  }
  if (body.action === "revoke_consent") {
    if (!exact(body, [...common, "purpose", "provider", "policyVersion"]) ||
      !["realtime_audio", "radar_context", "audio_diarization",
        "final_documentation", "audit_deidentification"].includes(String(body.purpose)) ||
      !["openai", "gemini", "nexa-core"].includes(String(body.provider)) ||
      typeof body.policyVersion !== "string" ||
      !/^[\w.-]{3,80}$/.test(body.policyVersion) ||
      !exact(body.confirmation, ["physicianRevokesAttestation"]) ||
      body.confirmation.physicianRevokesAttestation !== true) return null;
    return {
      kind: "record",
      params: {
        p_kind: "revoke", p_encounter: body.encounterId,
        p_action_id: body.actionId,
        p_expected_sync_version: null, p_displayed_digest: null,
        p_purpose: body.purpose as string, p_provider: body.provider as string,
        p_policy_version: body.policyVersion,
        p_explicit_confirmation: true, p_patient_scope_attested: false,
      },
    };
  }
  return null;
}

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // No SQL, RPC, auth, provider, patient read or event write is reachable in
  // any deployment of THIS commit. Removing this STOP needs separate approval.
  if (!DEPLOYED_SOURCE_ACTION_WRITER_AUTHORIZED) {
    return json({ error: "GATE_C_NO_GO", writer_active: false,
      external_ai_authorized: false, audit_submitted: false }, 423);
  }

  try {
    const header = req.headers.get("Authorization") || "";
    if (!header.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);
    const token = header.slice(7).trim();
    if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: "UNAVAILABLE" }, 503);
    }
    // The caller's own JWT is forwarded to an authenticated-only RPC.
    // No service_role, p_actor, or client-side auth/owner claim is accepted.
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: actor, error: authError } = await db.auth.getUser(token);
    if (authError || !validId(actor?.user?.id)) return json({ error: "UNAUTHORIZED" }, 401);

    const bodyText = await req.text();
    if (bodyText.length > 2048) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
    const request = decodeRequest(JSON.parse(bodyText));
    if (!request) return json({ error: "EXPLICIT_ACTION_REQUIRED" }, 400);
    if (request.kind === "prepare") {
      const { data, error } = await db.rpc("nexa_p0_prepare_source_review",
        { p_encounter: request.encounter });
      if (error || !data) return json({ error: "SOURCE_NOT_VERIFIED" }, 409);
      // The future UI must show THIS exact server snapshot before ACK.
      return json({ status: "PERSISTED_SNAPSHOT_FOR_PHYSICIAN_REVIEW",
        source: data, external_ai_authorized: false, gate_c_verified: false });
    }
    const { data, error } = await db.rpc("nexa_p0_record_source_action", request.params);
    if (error || !data?.event_id || data?.authorizes_external_ai !== false) {
      return json({ error: "SOURCE_ACTION_NOT_RECORDED" }, 409);
    }
    return json({ status: "SOURCE_ACTION_PERSISTED_ONLY", event: data,
      external_ai_authorized: false, gate_c_verified: false });
  } catch {
    // No clinical content or provider response is logged.
    return json({ error: "SOURCE_ACTION_FAILED_CLOSED" }, 400);
  }
});
