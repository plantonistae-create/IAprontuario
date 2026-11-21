import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { readBoundedTextReadbackBody, readVerifiedTextPackage, TextReadbackError } from '../_shared/nexa-clinical-text-readback.mjs';
import { listOwnedHistory, buildHistoryCursorFilter, HistoryListError } from '../_shared/nexa-clinical-history-list.mjs';

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
    // Hard byte cap during streaming, not after buffering the entire body.
    // Package content always comes from the owner-scoped database lookup.
    const body = await readBoundedTextReadbackBody(req);
    const client = createClient(url, anon, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return json(req, 401, { error: 'UNAUTHORIZED' });
    const { data: capabilities, error: capabilityError } = await client.rpc('get_my_capabilities');
    // RPC/transport failures are not proof that a physician is disabled.
    // Remain fail-closed, but report unavailable rather than an access denial.
    if (capabilityError) return json(req, 503, { error: 'CAPABILITIES_UNAVAILABLE' });
    // Zero rows means no clinical capability; multiple rows are an ambiguous
    // authority response and must never be resolved by choosing the first.
    if (Array.isArray(capabilities) && capabilities.length > 1)
      return json(req, 503, { error: 'CAPABILITIES_AMBIGUOUS' });
    const capability = Array.isArray(capabilities) ? capabilities[0] : capabilities;
    // Read-only cross-device consultation index. Every page repeats JWT,
    // active clinical capability and owner-filtered RLS checks. No service key.
    if (body?.action === 'list') {
      const result = await listOwnedHistory({
        actor: user.id, capability, request: body,
        listRows: async ({ owner, limit, from_utc, until_utc, cursor }) => {
          let query = client.from('consultation_history')
            .select('id,encounter_id,user_id,created_at,updated_at,sync_version,status,encounter_state')
            .eq('user_id', owner)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(limit + 1);
          if (from_utc) query = query.gte('created_at', from_utc);
          if (until_utc) query = query.lt('created_at', until_utc);
          if (cursor) {
            // Both cursor members are strictly validated by the shared contract
            // before being interpolated into PostgREST's filter syntax.
            query = query.or(buildHistoryCursorFilter(cursor));
          }
          const { data, error } = await query;
          if (error) throw new HistoryListError('HISTORY_LIST_UNAVAILABLE', 503);
          return data;
        }
      });
      return json(req, 200, result);
    }
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
    if (error instanceof HistoryListError) return json(req, error.status, { error: error.code });
    if (error instanceof TextReadbackError) return json(req, error.status, { error: error.code });
    return json(req, 503, { error: 'READBACK_UNAVAILABLE' });
  }
});
