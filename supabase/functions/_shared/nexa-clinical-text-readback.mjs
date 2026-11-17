// Candidate-only readback of the CURRENT textual encounter version.
// No immutable archive, audio, consent assertion or server-side writes.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
export class TextReadbackError extends Error {
  constructor(code, status) { super(code); this.name = 'TextReadbackError'; this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new TextReadbackError(code, status); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);

// Bound bytes WHILE reading: req.text() buffers arbitrarily large unauthenticated
// payloads before a post-read size check can reject them.
export async function readBoundedTextReadbackBody(request) {
  if (!request?.body) fail('INVALID_REQUEST', 400);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request.body) {
      if (!(chunk instanceof Uint8Array)) fail('INVALID_REQUEST', 400);
      if (chunk.byteLength > 4096 - size) fail('REQUEST_TOO_LARGE', 413);
      chunks.push(chunk);
      size += chunk.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof TextReadbackError) throw error;
    fail('INVALID_REQUEST', 400);
  }
}

export function parseTextReadbackRequest(input) {
  if (!object(input) || Object.keys(input).some(k => !['encounter_id','expected_sync_version','expected_sha256'].includes(k))) fail('INVALID_REQUEST', 400);
  if (typeof input.encounter_id !== 'string' || !UUID.test(input.encounter_id)) fail('INVALID_ENCOUNTER_ID', 400);
  if (!Number.isSafeInteger(input.expected_sync_version) || input.expected_sync_version < 0) fail('INVALID_EXPECTED_VERSION', 400);
  if (input.expected_sha256 !== undefined && (typeof input.expected_sha256 !== 'string' || !SHA256.test(input.expected_sha256))) fail('INVALID_EXPECTED_SHA256', 400);
  return { encounter_id: input.encounter_id.toLowerCase(), expected_sync_version: input.expected_sync_version, expected_sha256: input.expected_sha256 ?? null };
}

// Stable JSON for an authenticated readback; rejects values with no JSON meaning.
export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  fail('NON_JSON_PACKAGE', 422);
}

export async function readVerifiedTextPackage({ actor, capability, request, lookup, hashCanonical }) {
  const cmd = parseTextReadbackRequest(request);
  if (typeof actor !== 'string' || !UUID.test(actor)) fail('UNAUTHORIZED', 401);
  const owner = actor.toLowerCase();
  if (!capability || capability.access_status !== 'active' || capability.clinical_access !== true) fail('CLINICAL_ACCESS_REQUIRED', 403);
  if (typeof lookup !== 'function' || typeof hashCanonical !== 'function') fail('READBACK_UNAVAILABLE', 503);
  const source = await lookup({ owner, encounter_id: cmd.encounter_id });
  if (!source) fail('SOURCE_NOT_FOUND', 404);
  if (source.user_id !== owner || source.encounter_id !== cmd.encounter_id) fail('OWNER_SCOPE_VIOLATION', 403);
  // Never replace malformed persisted clinical metadata with empty values:
  // that would make an incomplete package appear successfully verified.
  if (!Number.isSafeInteger(source.sync_version) || source.sync_version < 0 ||
      !object(source.fields) || !object(source.processing_meta) ||
      !Array.isArray(source.protocol_usage)) fail('SOURCE_INVALID', 409);
  if (source.sync_version !== cmd.expected_sync_version) fail('SOURCE_VERSION_CHANGED', 409);
  const pkg = {
    schema_version: 'nexa-clinical-text-readback-v1',
    encounter_id: source.encounter_id,
    sync_version: source.sync_version,
    updated_at: source.updated_at ?? null,
    encounter_state: source.encounter_state ?? null,
    consent_recorded_at: source.consent_recorded_at ?? null,
    fields: source.fields,
    processing_meta: source.processing_meta,
    protocol_usage: source.protocol_usage
  };
  const canonical = canonicalJson(pkg);
  const sha256 = await hashCanonical(canonical);
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) fail('HASH_NOT_VERIFIED', 503);
  if (cmd.expected_sha256 !== null && cmd.expected_sha256 !== sha256) fail('SOURCE_CONTENT_MISMATCH', 409);
  return { verified: true, canonical_sha256: sha256, package: pkg, durable_archive: false, audio_included: false };
}
