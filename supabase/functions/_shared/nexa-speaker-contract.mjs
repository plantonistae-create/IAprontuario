// Speaker attribution is transient clinical input, never a training transcript.
export const SPEAKER_ROLE_VALUES = Object.freeze(['physician','patient','companion','other']);
const ID = /^[A-Za-z0-9_-]{1,32}$/;
const ROLE_LABELS = Object.freeze({physician:'MÉDICO',patient:'PACIENTE',companion:'ACOMPANHANTE',other:'OUTRO PARTICIPANTE'});
const TIME_LIMIT = 4 * 60 * 60;

export function validateSpeakerSegments(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1500) throw new Error('INVALID_SPEAKER_SEGMENTS');
  let total = 0;
  return value.map((segment) => {
    const speaker = String(segment?.speaker || '');
    const text = String(segment?.text || '').trim();
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    total += text.length;
    if (!ID.test(speaker) || !text || text.length > 2000 || total > 120000 ||
        !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > TIME_LIMIT) {
      throw new Error('INVALID_SPEAKER_SEGMENTS');
    }
    return {speaker, text, start, end};
  });
}

export function buildVerifiedSpeakerTranscript(segments, roles) {
  const clean = validateSpeakerSegments(segments);
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) throw new Error('SPEAKER_ROLES_REQUIRED');
  const speakers = [...new Set(clean.map(s => s.speaker))];
  const mapped = {};
  for (const speaker of speakers) {
    const role = String(roles[speaker] || '');
    if (!SPEAKER_ROLE_VALUES.includes(role)) throw new Error('SPEAKER_ROLE_UNCONFIRMED');
    mapped[speaker] = role;
  }
  if (!Object.values(mapped).includes('physician')) throw new Error('PHYSICIAN_SPEAKER_REQUIRED');
  const transcript = clean.map(s => {
    const from = s.start.toFixed(1);
    const to = s.end.toFixed(1);
    return '[' + from + 's–' + to + 's] ' + ROLE_LABELS[mapped[s.speaker]] + ': ' + s.text;
  }).join('\n');
  const counts = {physician:0,patient:0,companion:0,other:0};
  for (const s of clean) counts[mapped[s.speaker]]++;
  return { transcript, speakerAttribution: {
    schema_version:'speaker-attribution-v1',
    confirmed_by_physician:true,
    speaker_count:speakers.length,
    role_segment_counts:counts,
    transcript_retained:false,
    audio_retained:false,
    source:'clinician_confirmed_diarization'
  }};
}

/**
 * Zero-click diarization mode. Locutor IDs are acoustic clusters, NOT
 * identities, professions or relatives. The clinical model may rely on
 * explicit language cues, but must not promote an unverified role to fact.
 */
export function buildAutomaticSpeakerTranscript(segments) {
  const clean = validateSpeakerSegments(segments);
  const speakers = [...new Set(clean.map(s => s.speaker))];
  const transcript = clean.map(s => (
    '[' + s.start.toFixed(1) + 's–' + s.end.toFixed(1) +
    's] LOCUTOR ' + s.speaker + ' (papel não confirmado): ' + s.text
  )).join('\n');
  return {
    transcript,
    speakerAttribution: {
      schema_version: 'speaker-attribution-v1',
      confirmed_by_physician: false,
      speaker_count: speakers.length,
      role_segment_counts: {physician:0,patient:0,companion:0,other:clean.length},
      transcript_retained: false,
      audio_retained: false,
      source: 'automatic_unverified_diarization'
    }
  };
}
