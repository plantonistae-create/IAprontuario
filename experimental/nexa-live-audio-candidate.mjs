// NEXA audio-cost laboratory: offline protocol candidate ONLY.
// Deliberately not imported by the production frontend or Edge Functions.
// No WebSocket connection, audio upload, patient persistence or API calls here.
export const LIVE_TRANSCRIBE_MODEL = 'gpt-live-transcribe';
export const LIVE_TRANSCRIBE_SERVER_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

// Fail closed even when a stale feature flag is accidentally set on production.
// Authenticated production transport remains `realtime-call` v5.
export function selectAudioTranscriptionTransport({
  flag = 'off',
  runtime = 'production',
  speakerLabelsRequired = true
} = {}) {
  if (runtime !== 'local' || flag !== 'on')
    return { mode: 'legacy', reason: 'CANDIDATE_DISABLED' };
  if (speakerLabelsRequired)
    return { mode: 'legacy', reason: 'NATIVE_SPEAKER_LABELS_UNAVAILABLE' };
  return { mode: 'candidate-protocol-only', reason: 'LOCAL_SYNTHETIC_ONLY' };
}

export function buildLiveTranscriptionSessionUpdate({
  prompt = 'Consulta medica em portugues brasileiro. Preserve termos, nomes comerciais, unidades, numeros e negacoes literalmente; nao resuma ou invente.',
  keywords = ['omeprazol', 'dipirona', 'Novalgina'],
  delay = 'medium'
} = {}) {
  if (typeof prompt !== 'string' || prompt.length > 800 || /[\x00-\x1F]/.test(prompt))
    throw new Error('INVALID_AUDIO_CANDIDATE_PROMPT');
  if (!Array.isArray(keywords) || keywords.length > 20 ||
      keywords.some(k => typeof k !== 'string' || k.length < 1 || k.length > 80 || /[<>\r\n]/.test(k)))
    throw new Error('INVALID_AUDIO_CANDIDATE_KEYWORDS');
  if (!['low', 'medium', 'high'].includes(delay))
    throw new Error('INVALID_AUDIO_CANDIDATE_DELAY');
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          transcription: {
            model: LIVE_TRANSCRIBE_MODEL,
            prompt,
            keywords,
            languages: ['pt'],
            delay
          },
          // gpt-live-transcribe does not support server_vad / semantic_vad.
          // A future client must commit turns after LOCAL VAD and compare
          // medication, negation and missing-segment performance.
          turn_detection: null
        }
      }
    }
  };
}

export function createAppendEvent(pcm16Base64) {
  if (typeof pcm16Base64 !== 'string' || pcm16Base64.length === 0 ||
      pcm16Base64.length > 262144 || pcm16Base64.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(pcm16Base64))
    throw new Error('INVALID_AUDIO_PACKET');
  return {type: 'input_audio_buffer.append', audio: pcm16Base64};
}

export function createCommitEvent() {
  return {type: 'input_audio_buffer.commit'};
}

// A clinical consumer must not treat deltas as findings. Completed turns are
// published in server-committed order only. A gap/failure makes the transcript
// explicitly incomplete rather than silently dropping evidence.
export function createCompletedTurnCollector() {
  const order = [], entries = new Map();
  let unavailable = false;
  function ingest(event) {
    if (!event || typeof event !== 'object') return false;
    if (event.type === 'error') { unavailable = true; return true; }
    const id = typeof event.item_id === 'string' ? event.item_id : '';
    if (!/^[A-Za-z0-9_:.-]{1,120}$/.test(id)) return false;
    if (event.type === 'input_audio_buffer.committed') {
      if (!entries.has(id)) { entries.set(id,{state:'pending',text:''}); order.push(id); return true; }
      return false;
    }
    if (event.type === 'conversation.item.input_audio_transcription.delta') return false;
    if (event.type !== 'conversation.item.input_audio_transcription.completed' &&
        event.type !== 'conversation.item.input_audio_transcription.failed') return false;
    if (!entries.has(id)) { entries.set(id,{state:'pending',text:''}); order.push(id); }
    const old = entries.get(id);
    if (old.state !== 'pending') return false;
    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      old.state = 'failed'; unavailable = true; return true;
    }
    if (typeof event.transcript !== 'string' || !event.transcript.trim()) {
      old.state = 'failed'; unavailable = true; return true;
    }
    old.state = 'complete'; old.text = event.transcript; return true;
  }
  function snapshot() {
    const emitted = [];
    for (const id of order) {
      const entry = entries.get(id);
      if (entry.state !== 'complete') break;
      emitted.push(entry.text);
    }
    return {
      transcript: emitted.join('\n'),
      complete: !unavailable && order.every(id => entries.get(id).state === 'complete'),
      unavailable: unavailable || order.some(id => entries.get(id).state === 'failed'),
      pending: order.filter(id => entries.get(id).state === 'pending').length
    };
  }
  return {ingest,snapshot,reset(){order.length=0;entries.clear();unavailable=false;}};
}

// Public pricing snapshot (2026-11-05), NOT provider billing data.
// Applies to the Radar's live audio transport only; shared downstream
// structuring/final transcription charges must not be counted twice.
export const AUDIO_PRICES_USD = Object.freeze({
  live_transcribe_minute: 0.017,
  realtime_mini_audio_input_million: 10.00,
  realtime_mini_audio_cached_input_million: 0.30,
  realtime_mini_audio_output_million: 20.00,
  fallback_mini_transcription_minute: 0.003
});

const nonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const usd = n => Math.round(n * 1e6) / 1e6;

// No speculative current-cost or savings if provider-supplied usage is missing.
export function compareLiveAudioCost({
  minutes,
  realtimeAudioInputTokens,
  realtimeAudioCachedInputTokens,
  realtimeAudioOutputTokens,
  fallbackTranscriptionMinutes
} = {}) {
  if (!nonnegative(minutes) || minutes > 1440)
    throw new Error('INVALID_AUDIO_DURATION');
  const dedicatedCostUsd = usd(minutes * AUDIO_PRICES_USD.live_transcribe_minute);
  const values = [realtimeAudioInputTokens,realtimeAudioCachedInputTokens,
    realtimeAudioOutputTokens,fallbackTranscriptionMinutes];
  if (!values.every(nonnegative)) return {
    comparable: false,
    dedicatedCostUsd,
    currentCostUsd: null,
    potentialSavingsUsd: null,
    reason: 'CURRENT_AUDIO_USAGE_UNAVAILABLE'
  };
  if (realtimeAudioCachedInputTokens > realtimeAudioInputTokens ||
      fallbackTranscriptionMinutes > minutes)
    throw new Error('INVALID_AUDIO_USAGE');
  const legacyUsd = (
    (realtimeAudioInputTokens - realtimeAudioCachedInputTokens) *
      AUDIO_PRICES_USD.realtime_mini_audio_input_million +
    realtimeAudioCachedInputTokens * AUDIO_PRICES_USD.realtime_mini_audio_cached_input_million +
    realtimeAudioOutputTokens * AUDIO_PRICES_USD.realtime_mini_audio_output_million
  ) / 1e6 + fallbackTranscriptionMinutes * AUDIO_PRICES_USD.fallback_mini_transcription_minute;
  return {
    comparable: true,
    dedicatedCostUsd,
    currentCostUsd: usd(legacyUsd),
    potentialSavingsUsd: usd(legacyUsd - dedicatedCostUsd),
    reason: 'SIMULATION_NOT_BILLED_COST'
  };
}
