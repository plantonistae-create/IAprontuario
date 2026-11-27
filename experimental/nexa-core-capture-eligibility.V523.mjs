// NEXA Core — prospective capture -> dataset ELIGIBILITY and EXPORT PLAN (V5.23). OFFLINE, pure functions: no network, no Supabase, no provider calls, reads nothing by itself.
// Principles (each one is enforced and tested):
//  1. Capture is preservation. Eligibility is a SEPARATE human decision (`rights`), never derived from the capture, from a model output or from a grant.
//  2. Model/provider output is NEVER a training label. A transcript or a structured note produced by OpenAI/Gemini/any provider is exported as `machine_generated` with training_ready=false.
//     A record becomes training-ready only through an explicit human CORE REVIEW attestation that names that exact record digest. There is no automatic promotion path.
//  3. A physician correction is evidence of what the physician approved (`physician_corrected`), not by itself a Core review.
//  4. Chain integrity is a SERVER attestation (verify_chain: valid + head) matched against the last record received; a broken/unattested chain exports nothing.
//  5. Provenance (provider, model, model_version, pipeline_version) must be complete and not 'unreported'; otherwise training_ready=false.
//  6. Rights must be present, scoped, unexpired and unrevoked; de-identification must be marked verified by a named human; a PII scan is a second, independent check.
//  7. Identity never leaves: owner/encounter ids are replaced by salted pseudonyms; the salt is supplied by the caller (no default).
import { createHash } from 'node:crypto';
export const KINDS = ['audio_ref', 'transcript_provisional', 'transcript_final', 'transcript_corrected', 'clinical_fields', 'radar', 'physician_edit', 'provenance'];
const SCOPES = ['asr', 'documentation', 'radar'];
const PURPOSES = ['evaluation', 'training'];   // V5.31: separate rights; absent => evaluation only. Training needs an explicit 'training' purpose.   // 'audio' bytes are never part of this planner: only the verified audio reference travels
const UNREPORTED = new Set(['', 'unreported', 'unknown', 'null', 'undefined']);
const PII = [[/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, 'CPF'], [/[\w.+-]+@[\w-]+\.[\w.-]+/, 'EMAIL'], [/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/, 'PHONE'], [/\b(?:prontu[aá]rio|paciente)\s*(?:n[ºo.]?\s*)?[:#]?\s*\d{4,}/i, 'RECORD_NUMBER']];
const sha = (t) => createHash('sha256').update(t).digest('hex');
const pseudo = (salt, kind, v) => sha(`${salt}|${kind}|${v}`).slice(0, 32);
const isoOk = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function piiFindings(value) { const text = JSON.stringify(value); return PII.filter(([re]) => re.test(text)).map(([, n]) => n); }
export function validateRights(rights, now = new Date()) {
  const why = [], r = rights?.core_export;
  if (!r || typeof r !== 'object') return ['RIGHTS_MISSING'];
  if (typeof r.authorized_by !== 'string' || r.authorized_by.length < 3) why.push('RIGHTS_NO_NAMED_AUTHORIZER');
  if (!isoOk(r.authorized_at) || Date.parse(r.authorized_at) > now) why.push('RIGHTS_BAD_DATE');
  if (!Array.isArray(r.scope) || !r.scope.length || !r.scope.every((s) => SCOPES.includes(s))) why.push('RIGHTS_SCOPE_INVALID');
  if (r.purposes !== undefined && (!Array.isArray(r.purposes) || !r.purposes.length || !r.purposes.every((x) => PURPOSES.includes(x)))) why.push('RIGHTS_PURPOSE_INVALID');
  if (r.deidentification?.verified !== true || typeof r.deidentification?.verified_by !== 'string' || r.deidentification.verified_by.length < 3) why.push('DEIDENTIFICATION_NOT_VERIFIED_BY_A_NAMED_HUMAN');
  if (!isoOk(r.expires_at) || Date.parse(r.expires_at) <= now) why.push('RIGHTS_EXPIRED_OR_UNDATED');
  if (r.revoked_at) why.push('RIGHTS_REVOKED');
  return why;
}
function chainProblems(chain, attestation) {
  const why = [];
  if (!Array.isArray(chain) || !chain.length) return ['CHAIN_EMPTY'];
  chain.forEach((r, i) => { if (r.seq !== i + 1) why.push('CHAIN_SEQUENCE_GAP'); if (!KINDS.includes(r.kind)) why.push('CHAIN_UNKNOWN_KIND:' + String(r.kind).slice(0, 30)); if (i && r.parent_digest !== chain[i - 1].record_digest) why.push('CHAIN_PARENT_MISMATCH'); });
  if (!attestation || attestation.valid !== true || attestation.records !== chain.length || attestation.head !== chain[chain.length - 1].record_digest) why.push('CHAIN_NOT_SERVER_ATTESTED');
  return [...new Set(why)];
}
/** @returns {{eligible:boolean, reasons:string[], records:object[], summary:object}} */
export function planEncounterExport({ ownerId, encounterId, chain, serverAttestation, rights, coreReview = [], salt, now = new Date() }) {
  if (typeof salt !== 'string' || salt.length < 16) throw Error('PSEUDONYM_SALT_REQUIRED');
  const reasons = [...validateRights(rights, now), ...chainProblems(chain, serverAttestation)];
  const scope = new Set(rights?.core_export?.scope || []), purposes = new Set(rights?.core_export?.purposes || ['evaluation']);
  if (reasons.length) return { eligible: false, reasons, records: [], summary: { exported: 0 } };
  const pii = piiFindings(chain.map((r) => r.payload));
  if (pii.length) return { eligible: false, reasons: pii.map((p) => 'PII_DETECTED:' + p), records: [], summary: { exported: 0 } };
  const prov = chain.filter((r) => r.kind === 'provenance').pop()?.payload || {};
  const provComplete = ['provider', 'model', 'model_version', 'pipeline_version'].every((k) => typeof prov[k] === 'string' && !UNREPORTED.has(prov[k].trim().toLowerCase()));
  const reviewed = new Map(coreReview.filter((x) => x && x.decision === 'approved_for_training' && typeof x.reviewer === 'string' && x.reviewer.length >= 3).map((x) => [x.record_digest, x]));
  const fields = chain.filter((r) => r.kind === 'clinical_fields'), edits = chain.filter((r) => r.kind === 'physician_edit');
  const out = [], enc = pseudo(salt, 'encounter', encounterId), own = pseudo(salt, 'owner', ownerId);
  const emit = (r, stream, labelStatus) => {
    if (!scope.has(stream)) return;
    const review = reviewed.get(r.record_digest) || null;
    out.push({ stream, encounter: enc, owner: own, seq: r.seq, kind: r.kind, record_digest: r.record_digest, payload: r.payload,
      provenance: provComplete ? { provider: prov.provider, model: prov.model, model_version: prov.model_version, pipeline_version: prov.pipeline_version } : null,
      label_status: labelStatus, machine_generated: labelStatus !== 'physician_corrected', provider_provenance_complete: provComplete,
      core_review: review ? { reviewer_pseudonym: pseudo(salt, 'reviewer', review.reviewer), decision: review.decision } : null,
      purpose: (!!review && provComplete && labelStatus !== 'provisional' && purposes.has('training')) ? 'training_candidate' : 'evaluation_only',
      training_ready: !!review && provComplete && labelStatus !== 'provisional' && purposes.has('training'), training_label: false /* a label is created by Core review tooling, never by this planner */ });
  };
  for (const r of chain) {
    if (r.kind === 'transcript_provisional') emit(r, 'asr', 'provisional');
    else if (r.kind === 'transcript_final') emit(r, 'asr', 'machine_generated');
    else if (r.kind === 'transcript_corrected') emit(r, 'asr', 'physician_corrected');
    else if (r.kind === 'clinical_fields') emit(r, 'documentation', 'machine_generated');
    else if (r.kind === 'physician_edit') emit(r, 'documentation', 'physician_corrected');
    else if (r.kind === 'radar') emit(r, 'radar', 'machine_generated');
    // audio_ref / provenance are not data streams: provenance travels inside every record's flags, audio bytes are out of scope
  }
  const corrected = fields.length > 0 && edits.some((e) => e.payload?.after_digest && e.payload.after_digest !== fields[fields.length - 1].payload?.fields_digest);
  const rc = rights.core_export; return { eligible: true, reasons: [], rights_summary: { scope: [...scope].sort(), purposes: [...purposes].sort(), expires_at: rc.expires_at, authorized_at: rc.authorized_at }, records: out, summary: { exported: out.length, provenance_complete: provComplete, physician_corrected: corrected, training_ready: out.filter((x) => x.training_ready).length } };
}
export function buildManifest(plans, { datasetVersion, now = new Date() }) {
  const rows = plans.flatMap((p) => p.records), jsonl = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  return { jsonl, manifest: { schema_version: 'nexa-core-capture-plan-v1', dataset_version: datasetVersion, generated_at: now.toISOString(), origin: 'prospective_capture', records: rows.length,
    encounters_exported: plans.filter((p) => p.eligible).length, encounters_refused: plans.filter((p) => !p.eligible).length, training_ready_records: rows.filter((r) => r.training_ready).length, sha256: sha(jsonl),
    machine_generated_never_auto_labeled: true, audio_bytes_included: false } };
}

/** V5.31 — one independent, hash-bound export PER TASK (asr | documentation | radar), each split into evaluation_only and training_candidate files that are never mixed. Pure; writes nothing. */
export function buildTaskExports(plans, { datasetVersion, now = new Date() }) {
  const rows = plans.flatMap((p) => p.records), out = {};
  for (const task of SCOPES) for (const purpose of ['evaluation_only', 'training_candidate']) {
    const sel = rows.filter((r) => r.stream === task && r.purpose === purpose); if (!sel.length) continue;
    const jsonl = sel.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const provSet = [...new Set(sel.map((r) => JSON.stringify(r.provenance)))].sort().map((x) => JSON.parse(x));
    const rightsSet = [...new Set(plans.filter((p) => p.eligible && p.records.some((r) => r.stream === task && r.purpose === purpose)).map((p) => JSON.stringify(p.rights_summary)))].sort().map((x) => JSON.parse(x));
    out[`${task}.${purpose}`] = { jsonl, manifest: { schema_version: 'nexa-core-task-export-v1', task, purpose, dataset_version: datasetVersion, generated_at: now.toISOString(), origin: 'prospective_capture', records: sel.length, sha256: sha(jsonl), provenance_set: provSet, rights_basis: rightsSet,
      machine_generated_never_auto_labeled: true, audio_bytes_included: false, provider_output_is_not_a_label: true } };
  }
  return out;
}
