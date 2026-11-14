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
  { kind: "bootstrap"; encounter: string } |
  { kind: "prepare"; encounter: string } |
  { kind: "record"; params: RpcRequest } | null {
  if (!plain(body) || !validId(body.encounterId)) return null;
  if (body.action === "prepare_recording") {
    // Never accept clinical fields, timestamps, policy claims or an actor ID.
    if (!exact(body, ["action", "encounterId"])) return null;
    return { kind: "bootstrap", encounter: body.encounterId };
  }
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
    if (request.kind === "bootstrap") {
      // P0 SOURCE BOOTSTRAP: this is ONLY a persisted owner-bound row,
      // NEVER consent, first-egress evidence or an authorization receipt.
      // The hard STOP above makes this code unreachable in this Draft.
      const { data: access, error: accessError } =
        await db.rpc("has_active_clinical_access");
      if (accessError || access !== true) {
        return json({ error: "ACTIVE_CLINICAL_ACCESS_REQUIRED" }, 403);
      }
      const table = db.from("consultation_history");
      const readOwned = async () => table
        .select("id,encounter_id,user_id,sync_version,encounter_state")
        .eq("encounter_id", request.encounter)
        .eq("user_id", actor.user.id)
        .maybeSingle();
      let { data: source, error: readError } = await readOwned();
      if (readError) return json({ error: "SOURCE_LOOKUP_FAILED" }, 409);
      if (!source) {
        // The existing encounter autosave writes these exact column names.
        // Do not insert a legacy browser consent timestamp. A blank source is
        // intentionally distinct from a medically reviewed consultation.
        const timestamp = new Date().toISOString();
        const { data: inserted, error: insertError } = await db
          .from("consultation_history")
          .insert({
            id: request.encounter,
            encounter_id: request.encounter,
            user_id: actor.user.id,
            fields: {},
            status: "draft",
            encounter_state: "draft",
            protocol_usage: [],
            processing_meta: {},
            consent_recorded_at: null,
            created_at: timestamp,
            updated_at: timestamp,
            last_client_saved_at: timestamp,
          })
          .select("id,encounter_id,user_id,sync_version,encounter_state")
          .single();
        if (insertError) {
          if (insertError.code !== "23505") {
            return json({ error: "SOURCE_BOOTSTRAP_FAILED" }, 409);
          }
          // Simultaneous same-encounter bootstrap: re-read via owner-only RLS;
          // never overwrite, repurpose or disclose another physician's row.
          const again = await readOwned();
          if (again.error || !again.data) {
            return json({ error: "SOURCE_BOOTSTRAP_CONFLICT" }, 409);
          }
          source = again.data;
        } else source = inserted;
      }
      if (!source || source.user_id !== actor.user.id ||
          source.encounter_id !== request.encounter ||
          source.id !== request.encounter ||
          source.encounter_state !== "draft" ||
          !Number.isSafeInteger(Number(source.sync_version)) ||
          Number(source.sync_version) < 0) {
        return json({ error: "SOURCE_OWNER_OR_STATE_MISMATCH" }, 409);
      }
      return json({
        status: "OWNER_BOUND_SOURCE_PERSISTED_ONLY",
        encounter_id: request.encounter,
        source_sync_version: Number(source.sync_version),
        source_persisted: true,
        external_ai_authorized: false,
        consent_evidence_verified: false,
        gate_c_verified: false,
      });
    }
    if (request.kind === "prepare") {
      const { data, error } = await db.rpc("nexa_p0_prepare_source_review",
        { p_encounter: request.encounter });
      // Never accept a successful RPC transport as proof of an exact source.
      // Reject malformed/unexpected DB responses rather than relaying their
      // arbitrary fields (which may contain clinical data) to the browser.
      const snapshot = plain(data) ? data.source_snapshot : null;
      const policies = plain(data) ? data.approved_policies : null;
      const purposes = ["realtime_audio", "radar_context", "audio_diarization",
        "final_documentation", "audit_deidentification"];
      const providers = ["openai", "gemini", "nexa-core"];
      if (error || !plain(data) || data.encounter_id !== request.encounter ||
          !version(data.source_sync_version) ||
          data.canonicalization !== "pg-jsonb-v1" ||
          typeof data.server_digest !== "string" ||
          !DIGEST.test(data.server_digest) ||
          !plain(snapshot) || !plain(snapshot.fields) ||
          !plain(snapshot.processing_meta) ||
          !Array.isArray(snapshot.protocol_usage) ||
          !Array.isArray(policies) || policies.length > 100 ||
          !policies.every((p: unknown) =>
            plain(p) && purposes.includes(String(p.purpose)) &&
            providers.includes(String(p.provider)) &&
            typeof p.policyVersion === "string" &&
            /^[\w.-]{3,80}$/.test(p.policyVersion))) {
        return json({ error: "SOURCE_SNAPSHOT_CONTRACT_INVALID" }, 409);
      }
      // This is an owner-bound persisted snapshot, NOT pre-egress authority,
      // verified patient consent or evidence of completed audio. Keep the
      // explicit negative capabilities even if an RPC later adds new fields.
      return json({
        status: "PERSISTED_SNAPSHOT_FOR_PHYSICIAN_REVIEW",
        source: {
          encounter_id: data.encounter_id,
          source_sync_version: data.source_sync_version,
          canonicalization: data.canonicalization,
          server_digest: data.server_digest,
          source_snapshot: snapshot,
          approved_policies: policies,
          pre_egress_source_verified: false,
          final_review_server_completeness_verified: false,
        },
        external_ai_authorized: false, gate_c_verified: false,
      });
    }
    const { data, error } = await db.rpc("nexa_p0_record_source_action", request.params);
    // A successful HTTP/RPC call is not an event receipt. Require the exact
    // server event kind, durable id, version and canonicalization even on
    // idempotent replays. Never forward arbitrary fields returned by an RPC.
    const expectedKind = request.params.p_kind === "consent"
      ? "PHYSICIAN_PATIENT_CONSENT_ATTESTATION"
      : request.params.p_kind === "review"
      ? "PHYSICIAN_FINAL_REVIEW_ACK" : "CONSENT_REVOKED";
    const recordedAt = typeof data?.server_recorded_at === "string"
      ? Date.parse(data.server_recorded_at) : NaN;
    const expectedVersion = request.params.p_expected_sync_version;
    if (error || !plain(data) || !validId(data.event_id) ||
        data.kind !== expectedKind ||
        !version(data.source_sync_version) ||
        (expectedVersion !== null && data.source_sync_version !== expectedVersion) ||
        data.canonicalization !== "pg-jsonb-v1" ||
        !Number.isFinite(recordedAt) ||
        data.authorizes_external_ai !== false ||
        data.gate_c_verified !== false) {
      return json({ error: "SOURCE_ACTION_RECEIPT_UNVERIFIED" }, 409);
    }
    // Read the consent event back through a distinct authenticated RPC.
    // A writer receipt alone is insufficient evidence of durable, current
    // ownership/purpose/version. This check grants NO egress admission.
    let receiptReadbackVerified = false;
    if (request.params.p_kind === "consent") {
      const { data: verified, error: verifyError } = await db.rpc(
        "nexa_p0_verify_consent_action", {
          p_event_id: data.event_id,
          p_encounter: request.params.p_encounter,
          p_expected_sync_version: request.params.p_expected_sync_version,
          p_displayed_digest: request.params.p_displayed_digest,
        });
      if (verifyError || !plain(verified) ||
          verified.event_present_and_current !== true ||
          verified.event_id !== data.event_id ||
          verified.kind !== expectedKind ||
          verified.source_sync_version !== expectedVersion ||
          verified.source_digest !== request.params.p_displayed_digest ||
          verified.canonicalization !== "pg-jsonb-v1" ||
          verified.purpose !== request.params.p_purpose ||
          verified.provider !== request.params.p_provider ||
          verified.policy_version !== request.params.p_policy_version ||
          verified.server_recorded_at !== data.server_recorded_at ||
          verified.external_ai_authorized !== false ||
          verified.gate_c_verified !== false) {
        // A failed read-back does not prove the original write rolled back.
        // Never send a success receipt or repeat a paid external operation.
        return json({ error: "CONSENT_RECEIPT_READBACK_NOT_VERIFIED",
          event_state: "UNCONFIRMED" }, 409);
      }
      receiptReadbackVerified = true;
    }
    return json({
      status: "SOURCE_ACTION_PERSISTED_ONLY",
      event: {
        event_id: data.event_id,
        kind: data.kind,
        source_sync_version: data.source_sync_version,
        canonicalization: data.canonicalization,
        server_recorded_at: data.server_recorded_at,
        receipt_readback_verified: receiptReadbackVerified,
      },
      external_ai_authorized: false,
      gate_c_verified: false,
    });
  } catch {
    // No clinical content or provider response is logged.
    return json({ error: "SOURCE_ACTION_FAILED_CLOSED" }, 400);
  }
});
