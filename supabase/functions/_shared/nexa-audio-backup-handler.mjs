// V5.23/V5.25 CANDIDATE (NOT DEPLOYED). Request handler of the `audio-backup` Edge function: encrypted clinical audio backup (purpose 'clinical_backup').
// Pure function of injected dependencies so it is testable without Deno/Supabase. It is NOT an AI path: no provider is ever called; nothing here is audit, training or Core export.
// Fail-closed order: CORS/origin -> hard-stop -> feature switch -> configuration -> JWT -> active clinical access -> request shape ->
//   WRITES (PUT chunk, POST manifest): LIVE server grant for ('clinical_backup', encounter) verified under the CALLER's JWT with exact echo
//   READS  (GET chunk/manifest/sessions): owner-keyed; the owner is ALWAYS the verified auth.uid(), so a physician can read only his/her own backup, on any device, without a new grant
//      (V5.25: reads must not depend on an expiring AI-egress-adjacent grant, otherwise recovery on a second device and retention re-confirmation would silently stop working)
//   -> envelope encryption (v1 per-chunk KMS wrap, or v2 per-session data key; operator switch NEXA_AUDIO_BACKUP_ENVELOPE) -> store (service_role wrappers; owner = verified auth.uid()).
import { Buffer } from 'node:buffer';
import { createBackupService } from './nexa-audio-backup-core.mjs';
import { createEnvelopeCodecCompat } from './nexa-audio-envelope-v2.mjs';
import { createKmsCustody } from './nexa-kms-custody.mjs';
import { createAwsKmsCustody } from './nexa-aws-kms-custody.mjs';
import { assistGateStopped } from './nexa-assist-gate.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CHUNK = 32 * 1024 * 1024;
const STATUS = new Map([['BACKUP_ACCESS_DENIED', 403], ['BACKUP_IDENTITY_CHANGED', 403], ['BACKUP_REQUEST_INVALID', 400], ['BACKUP_NOT_FOUND', 404], ['BACKUP_SEQUENCE_CONFLICT', 409], ['BACKUP_READBACK_MISSING', 409],
  ['BACKUP_INCOMPLETE_SESSION', 409], ['BACKUP_MANIFEST_CONFLICT', 409], ['INVALID_CHUNK', 400], ['BODY_TOO_LARGE', 413]]);
const MIME = /^audio\/(?:webm|mp4|ogg|wav)(?:;codecs=[a-z0-9.,-]{1,32})?$/;
export function createAudioBackupHandler({ env, createClient, fetchImpl = globalThis.fetch }) {
  const allowed = env('ALLOWED_ORIGIN') || 'https://plantonistae-create.github.io';
  const hdr = (req) => { const o = req.headers.get('Origin') || ''; return { 'Access-Control-Allow-Origin': o === allowed ? o : '', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-nexa-encounter-id',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin' }; };
  const json = (req, status, body) => new Response(JSON.stringify(body), { status, headers: { ...hdr(req), 'Content-Type': 'application/json' } });
  const int = (url, k) => { const v = url.searchParams.getAll(k); return v.length === 1 && /^(0|[1-9][0-9]{0,15})$/.test(v[0]) ? Number(v[0]) : -1; };
  let shared = null;   // isolate-level: service client, store, KMS custody and the codec (whose bounded data-key cache must outlive a single request)
  const build = () => {
    const [url0, , service, kms, kmsToken] = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXA_KMS_ENDPOINT', 'NEXA_KMS_TOKEN'].map(env);
    const custody = env('NEXA_KMS_PROVIDER') === 'aws'   // opt-in; default = the generic https custody front
      ? createAwsKmsCustody({ region: env('NEXA_AWS_REGION'), keyId: env('NEXA_AWS_KMS_KEY_ARN'), previousKeyIds: (env('NEXA_AWS_KMS_PREVIOUS_KEY_ARNS') || '').split(',').filter(Boolean), getCredentials: async () => ({ accessKeyId: env('NEXA_AWS_ACCESS_KEY_ID'), secretAccessKey: env('NEXA_AWS_SECRET_ACCESS_KEY') }), fetchImpl })
      : createKmsCustody({ endpoint: kms, getToken: async () => kmsToken, fetchImpl });
    const admin = createClient(url0, service, { auth: { persistSession: false } });
    const rpc = async (name, args) => { const { data, error } = await admin.rpc(name, args); if (error) { const code = /BACKUP_[A-Z_]+/.exec(String(error.message || ''))?.[0]; throw Error(code || 'AUDIO_BACKUP_STORE_FAILED'); } return data; };
    const keyArgs = (s) => ({ p_owner: s.ownerId, p_encounter: s.encounterId, p_session: s.sessionId, p_version: s.sourceVersion });
    const parseKey = (k) => { const [ownerId, encounterId, sessionId, sequence, sourceVersion] = JSON.parse(k); return { ownerId, encounterId, sessionId, sequence, sourceVersion }; };
    const store = {
      async read(k) { const s = parseKey(k); return (await rpc('nexa_audio_get_chunk', { ...keyArgs(s), p_sequence: s.sequence })) ?? null; },
      async insertIfAbsent(k, envelope) { const s = parseKey(k); return (await rpc('nexa_audio_put_chunk', { ...keyArgs(s), p_sequence: s.sequence, p_envelope: envelope })) === true; },
    };
    const sessionKeys = {
      async read(id) { const [ownerId, encounterId, sessionId, sourceVersion] = JSON.parse(id); const w = await rpc('nexa_audio_get_session_key', { p_owner: ownerId, p_encounter: encounterId, p_session: sessionId, p_version: sourceVersion }); return w ? { wrapped: w } : null; },
      async insertIfAbsent(id, v) { const [ownerId, encounterId, sessionId, sourceVersion] = JSON.parse(id); return (await rpc('nexa_audio_put_session_key', { p_owner: ownerId, p_encounter: encounterId, p_session: sessionId, p_version: sourceVersion, p_wrapped: v.wrapped })) === true; },
    };
    const codec = createEnvelopeCodecCompat({ custody, sessionKeys, writeVersion: env('NEXA_AUDIO_BACKUP_ENVELOPE') === 'v2' ? 'v2' : 'v1' });
    return { rpc, keyArgs, store, codec };
  };
  return async function handle(req) {
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: hdr(req) });
      if (assistGateStopped(env, 'audio-backup')) return json(req, 423, { error: 'P0_PRE_EGRESS_GATE_C_NO_GO' });
      if (req.headers.get('Origin') !== allowed) return json(req, 403, { error: 'ORIGIN_FORBIDDEN' });
      if (env('NEXA_AUDIO_BACKUP') !== 'enabled') return json(req, 503, { error: 'AUDIO_BACKUP_DISABLED' });                      // default OFF
      // V5.37 test window (all optional; unset = production behaviour unchanged). EXPIRES_AT: after this instant the function behaves as OFF, even if nobody turns the switch off (an unparsable value is treated as expired = fail closed).
      // ALLOWED_USERS: comma-separated Supabase user ids; when set, ONLY those users pass (decided on the server from the verified JWT subject, never from a client flag). A malformed list is a configuration error (503), never 'allow everyone'.
      const until = env('NEXA_AUDIO_BACKUP_EXPIRES_AT'); if (until !== undefined && until !== '' && !(Date.parse(until) > Date.now())) return json(req, 503, { error: 'AUDIO_BACKUP_DISABLED' });
      const allowRaw = env('NEXA_AUDIO_BACKUP_ALLOWED_USERS'), allowList = allowRaw === undefined || allowRaw === '' ? null : allowRaw.split(',').map((x) => x.trim().toLowerCase());
      if (allowList && (!allowList.length || allowList.length > 20 || !allowList.every((x) => UUID.test(x)))) return json(req, 503, { error: 'AUDIO_BACKUP_UNCONFIGURED' });
      const [url0, anon, service, kms, kmsToken] = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXA_KMS_ENDPOINT', 'NEXA_KMS_TOKEN'].map(env);
      const kmsReady = env('NEXA_KMS_PROVIDER') === 'aws' ? ['NEXA_AWS_REGION', 'NEXA_AWS_KMS_KEY_ARN', 'NEXA_AWS_ACCESS_KEY_ID', 'NEXA_AWS_SECRET_ACCESS_KEY'].every((n) => Boolean(env(n))) : Boolean(kms && kmsToken);
      if (![url0, anon, service].every(Boolean) || !kmsReady) return json(req, 503, { error: 'AUDIO_BACKUP_UNCONFIGURED' });
      const authorization = req.headers.get('Authorization') || '';
      if (!/^Bearer \S+$/.test(authorization)) return json(req, 401, { error: 'UNAUTHORIZED' });
      const user = createClient(url0, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
      const { data: { user: me } = {}, error: authError } = await user.auth.getUser();
      if (authError || !me || !UUID.test(String(me.id))) return json(req, 401, { error: 'UNAUTHORIZED' });
      if (allowList && !allowList.includes(String(me.id).toLowerCase())) return json(req, 403, { error: 'BACKUP_USER_NOT_ALLOWED' });
      const { data: caps, error: capError } = await user.rpc('get_my_capabilities'); const cap = Array.isArray(caps) ? caps[0] : caps;
      if (capError || !cap || cap.access_status !== 'active' || !cap.clinical_access) return json(req, 403, { error: 'CLINICAL_ACCESS_REQUIRED' });
      const url = new URL(req.url), route = url.pathname.replace(/\/+$/, '').split('/').pop();
      if (!['chunks', 'manifest', 'sessions'].includes(route)) return json(req, 404, { error: 'ROUTE_NOT_FOUND' });
      if (url.searchParams.has('owner') || url.searchParams.has('purpose')) return json(req, 400, { error: 'BACKUP_REQUEST_INVALID' });   // identity and purpose are never client-supplied
      shared ||= build(); const { rpc, keyArgs, store, codec } = shared; const ownerId = String(me.id).toLowerCase();
      if (route === 'sessions') {   // multi-device recovery: the owner's finalized backups (metadata only)
        if (req.method !== 'GET') return json(req, 405, { error: 'METHOD_NOT_ALLOWED' });
        const list = await rpc('nexa_audio_list_manifests', { p_owner: ownerId });
        return json(req, 200, { sessions: Array.isArray(list) ? list : [], ownerId, trainingAuthorized: false });
      }
      const input = { encounterId: url.searchParams.get('encounter'), sessionId: url.searchParams.get('session'), sourceVersion: int(url, 'revision'), sequence: int(url, 'seq') };
      const scope = { ...input, ownerId };
      if (![scope.encounterId, scope.sessionId].every((x) => typeof x === 'string' && UUID.test(x)) || !(scope.sourceVersion >= 1)) return json(req, 400, { error: 'BACKUP_REQUEST_INVALID' });
      scope.encounterId = scope.encounterId.toLowerCase(); scope.sessionId = scope.sessionId.toLowerCase(); input.encounterId = scope.encounterId; input.sessionId = scope.sessionId;
      // live server grant (WRITES only), verified under the caller's own JWT with an exact echo (same contract as the assistance gate)
      const authorizeWrite = async ({ scope: s, purpose }) => {
        if (purpose !== 'clinical_backup') return false;
        const { data, error } = await user.rpc('nexa_assist_verify', { p_encounter: s.encounterId, p_purpose: 'clinical_backup' });
        if (error) throw Error('BACKUP_ACCESS_DENIED');
        const v = Array.isArray(data) ? data[0] : data, now = Date.parse(v?.server_now), end = Date.parse(v?.expires_at);
        return !!v && v.authorized === true && v.purpose === 'clinical_backup' && String(v.encounter_id).toLowerCase() === s.encounterId && String(v.owner_id).toLowerCase() === s.ownerId
          && UUID.test(String(v.grant_id)) && Number.isFinite(now) && Number.isFinite(end) && end > now;
      };
      const identity = async () => ({ ownerId: scope.ownerId, activeClinicalAccess: true });
      const writer = createBackupService({ authenticate: identity, authorizeSource: authorizeWrite, codec, store });
      const reader = createBackupService({ authenticate: identity, authorizeSource: async ({ purpose }) => purpose === 'clinical_backup', codec, store });   // owner-keyed read: scope.ownerId is the verified JWT subject
      if (route === 'chunks' && req.method === 'PUT') {
        if (!(await authorizeWrite({ scope, purpose: 'clinical_backup' }))) throw Error('BACKUP_ACCESS_DENIED');
        const len = Number(req.headers.get('Content-Length') || 0); if (len > MAX_CHUNK) throw Error('BODY_TOO_LARGE');
        const buf = Buffer.from(await req.arrayBuffer()); if (buf.length > MAX_CHUNK) throw Error('BODY_TOO_LARGE');
        return json(req, 200, await writer.upload('jwt', input, buf));
      }
      if (route === 'chunks' && req.method === 'GET') {
        if (!(await rpc('nexa_audio_get_manifest', keyArgs(scope)))) throw Error('BACKUP_NOT_FOUND');
        const bytes = await reader.recover('jwt', input);
        return new Response(bytes, { status: 200, headers: { ...hdr(req), 'Content-Type': 'application/octet-stream' } });
      }
      if (route === 'manifest') {
        let manifest;
        if (req.method === 'POST') {
          if (!(await authorizeWrite({ scope, purpose: 'clinical_backup' }))) throw Error('BACKUP_ACCESS_DENIED');
          const body = JSON.parse(await req.text()); if (!Number.isInteger(body?.chunkCount) || body.chunkCount < 1 || body.chunkCount > 7201 || typeof body?.mime !== 'string' || !MIME.test(body.mime)) throw Error('BACKUP_REQUEST_INVALID');
          manifest = await rpc('nexa_audio_finalize', { ...keyArgs(scope), p_count: body.chunkCount, p_mime: body.mime });
          if (!(await authorizeWrite({ scope, purpose: 'clinical_backup' }))) throw Error('BACKUP_ACCESS_DENIED');   // re-check after the write
        } else if (req.method === 'GET') { manifest = await rpc('nexa_audio_get_manifest', keyArgs(scope)); if (!manifest) throw Error('BACKUP_NOT_FOUND'); }
        else return json(req, 405, { error: 'METHOD_NOT_ALLOWED' });
        return json(req, 200, { ...manifest, ownerId: scope.ownerId, encounterId: scope.encounterId, sessionId: scope.sessionId, sourceVersion: scope.sourceVersion, trainingAuthorized: false });
      }
      return json(req, 405, { error: 'METHOD_NOT_ALLOWED' });
    } catch (e) {
      if (e instanceof SyntaxError) return json(req, 400, { error: 'BACKUP_REQUEST_INVALID' });
      const status = STATUS.get(e?.message); return status ? json(req, status, { error: e.message }) : json(req, 500, { error: 'AUDIO_BACKUP_FAILED' });
    }
  };
}
