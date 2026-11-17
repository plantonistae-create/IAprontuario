import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { readVerifiedTextPackage, TextReadbackError } from '../_shared/nexa-clinical-text-readback.mjs';

// Draft-only endpoint: disabled by default, never deployed or authorized for real patient data.
const url = Deno.env.get('SUPABASE_URL') || '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
const origin = Deno.env.get('ALLOWED_ORIGIN') || 'https://plantonistae-create.github.io';
const enabled = Deno.env.get('NEXA_TEXT_READBACK_ENABLED') === 'synthetic-review-v1';
const headers = (req: Request) => ({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache', 'Vary': 'Origin',
  'Access-Control-Allow-Origin': req.headers.get('Origin') === origin ? origin : '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
});
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: headers(req) });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (req.headers.get('Origin') !== origin) return json(req, 403, { error: 'ORIGIN_FORBIDDEN' });
  if (!enabled) return json(req, 503, { error: 'TEXT_READBACK_DISABLED' });
  if (!url || !anon) return json(req, 503, { error: 'READBACK_UNAVAILABLE' });
  const bearer = req.headers.get('Authorization') || '';
  if (!/^Bearer \S+$/.test(bearer)) return json(req, 401, { error: 'UNAUTHORIZED' });
  try {
    // Bound the untrusted request body; package content is read from the database only.
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return json(req, 413, { error: 'REQUEST_TOO_LARGE' });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json(req, 400, { error: 'INVALID_REQUEST' }); }
    const client = createClient(url, anon, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return json(req, 401, { error: 'UNAUTHORIZED' });
    const { data: capabilities, error: capabilityError } = await client.rpc('get_my_capabilities');
    if (capabilityError) return json(req, 403, { error: 'CAPABILITIES_UNAVAILABLE' });
    const capability = Array.isArray(capabilities) ? capabilities[0] : capabilities;
    const result = await readVerifiedTextPackage({
      actor: user.id, capability, request: body,
      lookup: async ({ owner, encounter_id }) => {
        // User JWT + RLS, no service_role. Both ownership predicates are mandatory.
        const { data, error } = await client.from('consultation_history')
          .select('encounter_id,user_id,sync_version,updated_at,encounter_state,consent_recorded_at,fields,processing_meta,protocol_usage')
          .eq('encounter_id', encounter_id).eq('user_id', owner).maybeSingle();
        if (error) throw new TextReadbackError('READBACK_UNAVAILABLE', 503);
        return data;
      },
      hashCanonical: async (canonical: string) => {
        const bytes = new TextEncoder().encode(canonical);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      }
    });
    return json(req, 200, result);
  } catch (error) {
    // Never log or return encounter data, source text, credentials or raw DB errors.
    if (error instanceof TextReadbackError) return json(req, error.status, { error: error.code });
    return json(req, 503, { error: 'READBACK_UNAVAILABLE' });
  }
});
