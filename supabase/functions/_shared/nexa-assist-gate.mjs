// V5.17 CANDIDATE (NOT DEPLOYED). Server-side ASSISTANCE gate for every Edge path that can reach an external AI provider.
// Modes (operator env NEXA_ASSIST_GATE, overridable per function with NEXA_ASSIST_GATE_<FUNCTION_NAME_UPPER_SNAKE>; the per-function value wins):
//   unset / anything else     -> 'off'     : this module changes NOTHING. The handler's own mandatory controls (JWT, active clinical access, origin, size limits) still run exactly as today.
//   'v515-assistance-enabled' -> 'enforce' : additionally ALL of: valid Supabase user JWT (auth.getUser), provider in the human-operated allow-list NEXA_ASSIST_APPROVED_PROVIDERS
//                                            (a decision about a vendor, never derived from a grant), an encounter id, and a live server grant for purpose 'assistance'
//                                            (public.nexa_assist_issue) re-verified HERE through public.nexa_assist_verify under the CALLER's JWT with an exact echo.
//   'hard-stop'               -> 'stop'    : emergency/incident switch: 423 P0_PRE_EGRESS_GATE_C_NO_GO before authentication, no provider call.
// There is deliberately NO named value that skips a control: 'off' only means "this new control is not switched on yet".
// A grant never covers audit, training, Core export or any other purpose. No client flag, header value or body field is evidence.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ASSIST_GATE_ON = 'v515-assistance-enabled';
export const ASSIST_GATE_STOP = 'hard-stop';
export const ENCOUNTER_HEADER = 'x-nexa-encounter-id';
/** @typedef {{allow:true,mode:string,userId:string|null,grantId:string|null,encounterId?:string,expiresAt?:string}} GateAllowed */
/** @typedef {{allow:false,status:number,body:Record<string,unknown>}} GateDenied */
const HARD_STOP = Object.freeze({ error: 'P0_PRE_EGRESS_GATE_C_NO_GO', external_ai_authorized: false });

/** @param {(name: string) => string | undefined} env @param {string} [fn] */
export function assistGateMode(env, fn) {
  const key = fn ? 'NEXA_ASSIST_GATE_' + String(fn).toUpperCase().replace(/[^A-Z0-9]+/g, '_') : null;
  const v = (key && env(key)) || env('NEXA_ASSIST_GATE');
  return v === ASSIST_GATE_ON ? 'enforce' : v === ASSIST_GATE_STOP ? 'stop' : 'off';
}
/** @param {(name: string) => string | undefined} env @param {string} [fn] */
export function assistGateStopped(env, fn) { return assistGateMode(env, fn) === 'stop'; }
/** @returns {GateDenied} */
export function hardStop() { return { allow: false, status: 423, body: { ...HARD_STOP } }; }
/** @returns {GateDenied} */
const deny = (status, error, reason) => ({ allow: false, status, body: { error, ...(reason ? { reason } : {}), external_ai_authorized: false } });

/**
 * @param {{req: Request, createClient: (...a: any[]) => any, env: (name: string) => string | undefined, provider?: string, providers?: string[], fn?: string}} a
 * @returns {Promise<GateAllowed|GateDenied>}
 */
export async function assistanceGate({ req, createClient, env, provider, providers, fn }) {
  const mode = assistGateMode(env, fn);
  if (mode === 'stop') return hardStop();
  if (mode === 'off') return { allow: true, mode: 'off', userId: null, grantId: null };
  const needed = Array.isArray(providers) ? providers : [provider];   // every provider the request can reach must be approved
  const approved = new Set(String(env('NEXA_ASSIST_APPROVED_PROVIDERS') || '').split(',').map(s => s.trim()).filter(Boolean));
  if (!needed.length || !needed.every(x => typeof x === 'string' && approved.has(x))) return deny(423, 'ASSIST_PROVIDER_NOT_APPROVED');
  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer \S+$/.test(authorization)) return deny(401, 'UNAUTHORIZED');
  const encounter = req.headers.get(ENCOUNTER_HEADER) || '';
  if (!UUID.test(encounter)) return deny(400, 'ENCOUNTER_ID_REQUIRED');
  const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
  if (!url || !anon) return deny(503, 'ASSIST_GATE_UNAVAILABLE');
  try {
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user } = {}, error } = await client.auth.getUser();
    if (error || !user || !UUID.test(String(user.id))) return deny(401, 'UNAUTHORIZED');
    const { data, error: rpcError } = await client.rpc('nexa_assist_verify', { p_encounter: encounter, p_purpose: 'assistance' });
    if (rpcError) return deny(503, 'ASSIST_GATE_UNAVAILABLE');
    const v = Array.isArray(data) ? data[0] : data;
    const now = Date.parse(v?.server_now), end = Date.parse(v?.expires_at);
    if (!v || v.authorized !== true || v.purpose !== 'assistance' || String(v.encounter_id).toLowerCase() !== encounter.toLowerCase()
        || String(v.owner_id).toLowerCase() !== String(user.id).toLowerCase() || !UUID.test(String(v.grant_id))
        || !Number.isFinite(now) || !Number.isFinite(end) || end <= now) {
      return deny(423, 'ASSISTANCE_NOT_AUTHORIZED', typeof v?.reason === 'string' && /^[A-Z_]{3,60}$/.test(v.reason) ? v.reason : 'NO_LIVE_GRANT');
    }
    return { allow: true, mode: 'enforce', userId: user.id, grantId: v.grant_id, encounterId: encounter, expiresAt: v.expires_at };
  } catch { return deny(503, 'ASSIST_GATE_UNAVAILABLE'); }   // any failure while enforcing = no egress
}
