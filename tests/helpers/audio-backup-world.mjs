// shared synthetic world for the audio-backup tests (in-memory Supabase stand-in + synthetic KMS). Not a production module.
// V5.23 — audio-backup Edge handler against an in-memory Supabase stand-in and a synthetic KMS. No network, no real data, no AI.
import assert from 'node:assert/strict'; import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'; import { Buffer } from 'node:buffer';
import { createAudioBackupHandler } from '../../supabase/functions/_shared/nexa-audio-backup-handler.mjs';
export const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', E = '33333333-3333-4333-8333-333333333333', S = '44444444-4444-4444-8444-444444444444';
export const ORIGIN = 'https://plantonistae-create.github.io';
export function world({ kmsDown = false } = {}) {
  const kek = randomBytes(32), chunks = new Map(), manifests = new Map(), sessionKeys = new Map(), grants = new Set([`${A}|${E}`]), users = { 'tok-A': A, 'tok-B': B, 'tok-X': null }; let kmsCalls = 0; const rpcLog = [];
  const key = (o, e, s, v) => [o, e, s, v].join('|');
  const createClient = (url, k, opts) => {
    const token = (opts?.global?.headers?.Authorization || '').replace('Bearer ', ''); const isAdmin = k === 'service';
    return {
      auth: { getUser: async () => users[token] ? { data: { user: { id: users[token] } }, error: null } : { data: { user: null }, error: { message: 'bad' } } },
      rpc: async (name, a) => { rpcLog.push(name);
        if (name === 'get_my_capabilities') return { data: [{ access_status: 'active', clinical_access: users[token] !== B || world.noClinicalB !== true }], error: null };
        if (name === 'nexa_assist_verify') { const me = users[token]; const ok = grants.has(`${me}|${a.p_encounter}`) && a.p_purpose === 'clinical_backup';
          return { data: ok ? { authorized: true, purpose: 'clinical_backup', encounter_id: a.p_encounter, owner_id: me, grant_id: 'cccccccc-0000-4000-8000-0000000000c1', server_now: new Date().toISOString(), expires_at: new Date(Date.now() + 3600e3).toISOString() } : { authorized: false, reason: 'NO_LIVE_GRANT' }, error: null }; }
        assert.ok(isAdmin, 'storage wrappers are reachable only with the service key');
        const kk = key(a.p_owner, a.p_encounter, a.p_session, a.p_version);
        if (name === 'nexa_audio_put_chunk') { const id = kk + '|' + a.p_sequence; if (manifests.has(kk) || chunks.has(id)) return { data: false, error: null }; chunks.set(id, a.p_envelope); return { data: true, error: null }; }
        if (name === 'nexa_audio_get_chunk') return { data: chunks.get(kk + '|' + a.p_sequence) ?? null, error: null };
        if (name === 'nexa_audio_get_manifest') return { data: manifests.get(kk) ?? null, error: null };
        if (name === 'nexa_audio_finalize') { const mine = [...chunks.entries()].filter(([id]) => id.startsWith(kk + '|')).map(([id, e]) => ({ sequence: Number(id.split('|').pop()), sha256: e.sha256, size: e.size })).sort((x, y) => x.sequence - y.sequence);
          if (!mine.length || mine.length !== a.p_count || mine.some((c, i) => c.sequence !== i)) return { data: null, error: { message: 'BACKUP_INCOMPLETE_SESSION' } };
          const dup = manifests.has(kk); if (!dup) manifests.set(kk, { mime: a.p_mime, chunk_count: a.p_count, chunks: mine, digest: createHash('sha256').update(mine.map(c => c.sequence + ':' + c.sha256 + ':' + c.size).join(',')).digest('hex')   /* same canonical form as the SQL derive_manifest trigger */, committed_at: new Date().toISOString() }); return { data: { ...manifests.get(kk), duplicate: dup }, error: null }; }
        if (name === 'nexa_audio_put_session_key') { const id = kk; if (sessionKeys.has(id)) return { data: false, error: null }; sessionKeys.set(id, a.p_wrapped); return { data: true, error: null }; }
        if (name === 'nexa_audio_get_session_key') return { data: sessionKeys.get(kk) ?? null, error: null };
        if (name === 'nexa_audio_list_manifests') return { data: [...manifests.entries()].filter(([id]) => id.startsWith(a.p_owner + '|')).map(([id, m]) => { const [o, e, s, v] = id.split('|'); return { encounter_id: e, session_id: s, source_version: Number(v), mime: m.mime, chunk_count: m.chunk_count, total_bytes: m.chunks.reduce((t, c) => t + c.size, 0), digest: m.digest, committed_at: m.committed_at }; }), error: null };
        return { data: null, error: { message: 'unknown rpc' } };
      },
    };
  };
  const fetchImpl = async (u, init) => { kmsCalls++; if (kmsDown) return new Response('x', { status: 503 }); const b = JSON.parse(init.body), aad = Buffer.from(b.aad_b64, 'base64'); const p = new URL(u).pathname;
    if (p === '/v1/wrap') { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', kek, iv); c.setAAD(aad); const ct = Buffer.concat([c.update(Buffer.from(b.key_b64, 'base64')), c.final()]); return Response.json({ key_id: 'kms/v1', blob: Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64') }); }
    const raw = Buffer.from(b.blob, 'base64'), d = createDecipheriv('aes-256-gcm', kek, raw.subarray(0, 12)); d.setAAD(aad); d.setAuthTag(raw.subarray(12, 28)); return Response.json({ key_b64: Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('base64') }); };
  const baseEnv = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', NEXA_KMS_ENDPOINT: 'https://kms.example/', NEXA_KMS_TOKEN: 't', NEXA_AUDIO_BACKUP: 'enabled' };
  const mk = (over = {}) => { const e = { ...baseEnv, ...over }; return createAudioBackupHandler({ env: n => e[n], createClient: (u, k, o) => createClient(u, k === 'service' ? 'service' : k, o), fetchImpl }); };
  return { mk, chunks, manifests, sessionKeys, grants, rpcLog, kmsCalls: () => kmsCalls };
}
export const req = (path, { method = 'GET', token = 'tok-A', origin = ORIGIN, body, extra = '' } = {}) => new Request(`https://x.supabase.co/functions/v1/audio-backup/${path}?encounter=${E}&session=${S}&revision=1${extra}`, { method, body, headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
