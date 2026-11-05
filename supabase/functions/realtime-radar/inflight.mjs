// Single-isolate, in-flight-only deduplication. No clinical payload or patient IDs in Map keys.
// A completed request is never cached: changed evidence, retries and new encounters
// always execute normally. Each request passes Auth/RLS checks before entering here.
export async function radarRequestFingerprint(owner, provider, model, raw) {
  if ([owner, provider, model, raw].some(v => typeof v !== 'string') ||
      !owner || !provider || !model || raw.length > 60000) {
    throw new Error('RADAR_INFLIGHT_KEY_INVALID');
  }
  const bytes = new TextEncoder().encode(JSON.stringify([owner, provider, model, raw]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function createRadarInFlightCoalescer(limit = 64) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1024) {
    throw new Error('RADAR_INFLIGHT_LIMIT_INVALID');
  }
  const pending = new Map();
  return function coalesce(key, execute) {
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key) ||
        typeof execute !== 'function') throw new Error('RADAR_INFLIGHT_ARGS_INVALID');
    const existing = pending.get(key);
    if (existing) return existing;
    // If the isolate is busy, fail open: execute the clinical request separately.
    const promise = Promise.resolve().then(execute);
    if (pending.size >= limit) return promise;
    pending.set(key, promise);
    const release = () => { if (pending.get(key) === promise) pending.delete(key); };
    promise.then(release, release);
    return promise;
  };
}

export const coalesceRadarInFlight = createRadarInFlightCoalescer();
