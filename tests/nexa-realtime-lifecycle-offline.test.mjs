import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Runs only the real frontend transport functions with synthetic browser doubles.
// No network, microphone, Supabase login, OpenAI API, clinical data, or paid requests.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const begin = html.indexOf('async function startRealtimeRadar(mediaStream){');
const end = html.indexOf('let mediaRecorder,stream,', begin);
assert.ok(begin > 0 && end > begin, 'transport functions must remain discoverable');
const transportSource = html.slice(begin, end);

function harness(behavior) {
  const state = { timers: [], requests: [], statuses: [], peers: [], recorders: 0, remoteAnswers: 0, fetchAborts: 0 };
  class Peer {
    constructor() { this.closed = false; state.peers.push(this); }
    addTrack() {}
    createDataChannel() { return { onmessage: null, onopen: null, onclose: null, close() {} }; }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\ns=synthetic\r\n' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { state.remoteAnswers++; }
    close() { this.closed = true; }
  }
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { state.recorders++; this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  const context = {
    AbortController, Blob, FormData, Response,
    window: { RTCPeerConnection: Peer },
    RTCPeerConnection: Peer,
    MediaRecorder: Recorder,
    APP_CONFIG: { realtimeCallPath: '/functions/v1/realtime-call', appVersion: 'synthetic' },
    SUPABASE_URL: 'https://example.invalid',
    SUPABASE_ANON_KEY: 'synthetic',
    sb: { auth: { async getSession() { return { data: { session: { access_token: 'synthetic' } } }; } } },
    $: () => ({ checked: true }),
    matchMedia: () => ({ matches: false }),
    radarTranscriptBuffer: { clear() {} },
    radarTransportStatus: (s) => state.statuses.push(s),
    handleRealtimeEvent: () => {},
    setTimeout: (fn, ms) => { const timer = { fn, ms, active: true }; state.timers.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.active = false; },
    clearInterval: () => {},
    fetch(url, options) {
      state.requests.push({ url, options });
      assert.ok(url.startsWith('https://example.invalid/'), 'synthetic endpoint only');
      if (behavior === 'http400') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'REALTIME_SESSION_FAILED', status: 400 }) });
      }
      if (behavior === 'pending') {
        return new Promise((_resolve, reject) => {
          if (options.signal.aborted) { state.fetchAborts++; reject(new Error('already aborted')); return; }
          options.signal.addEventListener('abort', () => { state.fetchAborts++; reject(new Error('synthetic abort')); }, { once: true });
        });
      }
      throw new Error('unexpected synthetic fetch mode');
    },
  };
  const declarations = "let radarTransportRevision=0,radarTransportAbort=new AbortController(),radarNegotiationAbort=null,radarConnectTimeout=null,radarChunkSequence=0,radarChunkQueue=[],radarChunkSending=false,radarFallbackActive=false,radarChunkStopper=null,radarChunkRecorder=null,realtimePc=null,realtimeDc=null,radarTimer=null,realtimeTranscript='',realtimeTranscriptDelta='',radarLastChars=0,recording=true,sessionPaused=false;\n";
  const exports = "\nglobalThis.control={start:startRealtimeRadar,stop:stopRealtimeRadar,drain:drainRadarChunks,enqueue:()=>radarChunkQueue.push({blob:new Blob(['synthetic'],{type:'audio/webm'}),id:'synthetic:1'})};";
  vm.runInNewContext(declarations + transportSource + exports, context, { timeout: 1000 });
  return { state, control: context.control, stream: { getAudioTracks: () => [{}] } };
}

async function until(predicate) {
  for (let i = 0; i < 50 && !predicate(); i++) await Promise.resolve();
  assert.ok(predicate(), 'synthetic asynchronous checkpoint not reached');
}

test('upstream 400 wrapped as 502 activates only one fallback, aborts negotiation and closes peer', async () => {
  const h = harness('http400');
  await h.control.start(h.stream);
  assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.recorders, 1);
  assert.equal(h.state.remoteAnswers, 0);
  assert.equal(h.state.peers[0].closed, true);
  assert.equal(h.state.requests[0].options.signal.aborted, true);
});

test('10-second connection timeout cancels in-flight negotiation but keeps chunk fallback live', async () => {
  const h = harness('pending');
  const started = h.control.start(h.stream);
  await until(() => h.state.requests.length === 1);
  const deadline = h.state.timers.find(t => t.active && t.ms === 10000);
  assert.ok(deadline);
  deadline.fn();
  await started;
  assert.equal(h.state.requests[0].options.signal.aborted, true);
  assert.equal(h.state.fetchAborts, 1);
  assert.equal(h.state.recorders, 1);
  assert.equal(h.state.peers[0].closed, true);
  assert.equal(h.state.remoteAnswers, 0);
  assert.ok(!h.state.statuses.includes('stopped'));
});

test('stop invalidates revision, aborts pending WebRTC and does not restart fallback', async () => {
  const h = harness('pending');
  const started = h.control.start(h.stream);
  await until(() => h.state.requests.length === 1);
  h.control.stop();
  await started;
  assert.equal(h.state.requests[0].options.signal.aborted, true);
  assert.equal(h.state.fetchAborts, 1);
  assert.equal(h.state.recorders, 0);
  assert.equal(h.state.statuses.at(-1), 'stopped');
});

test('18-second synthetic chunk timeout aborts only its own request and reports unavailable', async () => {
  const h = harness('pending');
  h.control.enqueue();
  const started = h.control.drain(0);
  await until(() => h.state.requests.length === 1);
  const deadline = h.state.timers.find(t => t.active && t.ms === 18000);
  assert.ok(deadline);
  deadline.fn();
  await started;
  assert.equal(h.state.requests[0].options.signal.aborted, true);
  assert.equal(h.state.fetchAborts, 1);
  assert.ok(h.state.statuses.includes('unavailable'));
});

test('source preserves JWT client gate, fallback multipart limit, and 400/502 status distinction', () => {
  const edge = readFileSync(new URL('../supabase/functions/realtime-call/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /await getAuthenticatedUser\(/);
  assert.match(edge, /upstream\.status/);
  assert.match(edge, /error:\s*"REALTIME_SESSION_FAILED"/);
  assert.match(edge, /emitRealtimeUpstreamStatus\("webrtc", upstream\.status\)/);
  assert.match(edge, /async function transcribeFallback\(/);
  assert.match(edge, /1024\s*\*\s*1024/);
  assert.match(transportSource, /const timeout=new AbortController\(\)/);
  assert.match(transportSource, /radarChunkQueue\.length<4/);
});
