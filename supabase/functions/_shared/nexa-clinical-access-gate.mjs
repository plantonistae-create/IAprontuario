// V4.58 candidate-only guard: mirror the hosted RLS clinical-slot predicate.
// Invoked exclusively with the authenticated user's Supabase client (never service_role).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ClinicalAccessGateError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'ClinicalAccessGateError';
    this.code = code;
    this.status = status;
  }
}
const fail = (code, status) => { throw new ClinicalAccessGateError(code, status); };

export async function requireOwnerClinicalAccess({ client, actor, capability }) {
  if (typeof actor !== 'string' || !UUID.test(actor)) fail('UNAUTHORIZED', 401);
  if (!capability || typeof capability.id !== 'string' || !UUID.test(capability.id) ||
      capability.id.toLowerCase() !== actor.toLowerCase() ||
      capability.access_status !== 'active' || capability.clinical_access !== true) {
    fail('CLINICAL_ACCESS_REQUIRED', 403);
  }
  if (typeof client?.rpc !== 'function') fail('CLINICAL_ACCESS_UNAVAILABLE', 503);
  let result;
  try {
    // The caller's client must carry the verified user's Bearer JWT. No privileged key.
    result = await client.rpc('has_active_clinical_access');
  } catch {
    fail('CLINICAL_ACCESS_UNAVAILABLE', 503);
  }
  if (!result || result.error || typeof result.data !== 'boolean') {
    fail('CLINICAL_ACCESS_UNAVAILABLE', 503);
  }
  if (result.data !== true) fail('CLINICAL_ACCESS_REQUIRED', 403);
  return true;
}
