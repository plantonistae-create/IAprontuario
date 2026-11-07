// Isolated research helper for a future browser candidate only.
// It does NOT mutate the NEXA frontend, initiate network traffic, or log SDP.
export class RealtimeIceGateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RealtimeIceGateError';
    this.code = code;
  }
}

export function finalLocalOffer(pc) {
  const sdp = pc?.localDescription?.sdp;
  if (typeof sdp !== 'string' || !sdp.startsWith('v=0')) {
    throw new RealtimeIceGateError('FINAL_LOCAL_SDP_MISSING');
  }
  return sdp;
}

export function waitForIceComplete(
  pc,
  {
    signal,
    timeoutMs = 7500,
    schedule = setTimeout,
    cancel = clearTimeout,
  } = {},
) {
  if (!pc || typeof pc.addEventListener !== 'function' ||
      typeof pc.removeEventListener !== 'function') {
    return Promise.reject(new RealtimeIceGateError('PEER_REQUIRED'));
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) {
    return Promise.reject(new RealtimeIceGateError('INVALID_ICE_TIMEOUT'));
  }
  if (signal?.aborted) {
    return Promise.reject(new RealtimeIceGateError('ICE_CANCELLED'));
  }
  if (pc.iceGatheringState === 'complete') {
    try { return Promise.resolve(finalLocalOffer(pc)); }
    catch (error) { return Promise.reject(error); }
  }
  return new Promise((resolve, reject) => {
    let done = false;
    let timer;
    const clean = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      signal?.removeEventListener('abort', onAbort);
      if (timer !== undefined) cancel(timer);
    };
    const settle = (fn, arg) => {
      if (done) return;
      done = true;
      clean();
      fn(arg);
    };
    const onAbort = () => settle(reject, new RealtimeIceGateError('ICE_CANCELLED'));
    const onChange = () => {
      if (pc.iceGatheringState !== 'complete') return;
      try { settle(resolve, finalLocalOffer(pc)); }
      catch (error) { settle(reject, error); }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = schedule(
      () => settle(reject, new RealtimeIceGateError('ICE_TIMEOUT')),
      timeoutMs,
    );
    if (signal?.aborted) onAbort();
    else onChange();
    if (done && timer !== undefined) cancel(timer);
  });
}
