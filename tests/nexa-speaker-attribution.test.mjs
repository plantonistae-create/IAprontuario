import test from "node:test";
import assert from "node:assert/strict";
import { validateSpeakerSegments, buildVerifiedSpeakerTranscript, buildAutomaticSpeakerTranscript } from "../supabase/functions/_shared/nexa-speaker-contract.mjs";
import { safeCoreContext } from "../supabase/functions/submit-audit-case/audit-contract.mjs";

const segments = [
  { speaker: "A", start: 0, end: 2, text: "Quando começou a febre?" },
  { speaker: "B", start: 2, end: 4, text: "Começou há dois dias." },
  { speaker: "C", start: 4, end: 7, text: "Eu acompanho minha filha." }
];

test("clinician confirmation preserves speaker origin", () => {
  const result = buildVerifiedSpeakerTranscript(segments, {
    A: "physician", B: "patient", C: "companion"
  });
  assert.match(result.transcript, /MÉDICO:/);
  assert.match(result.transcript, /PACIENTE:/);
  assert.match(result.transcript, /ACOMPANHANTE:/);
  assert.equal(result.speakerAttribution.role_segment_counts.companion, 1);
  assert.equal(result.speakerAttribution.transcript_retained, false);
});

test("every speaker requires a confirmed role", () => {
  assert.throws(
    () => buildVerifiedSpeakerTranscript(segments, { A: "physician", B: "patient" }),
    /SPEAKER_ROLE_UNCONFIRMED/
  );
  assert.throws(
    () => buildVerifiedSpeakerTranscript(segments, { A: "patient", B: "patient", C: "companion" }),
    /PHYSICIAN_SPEAKER_REQUIRED/
  );
});

test("rejects invalid segment time ranges", () => {
  assert.throws(() => validateSpeakerSegments([
    { speaker: "A", start: 2, end: 1, text: "teste" }
  ]), /INVALID_SPEAKER_SEGMENTS/);
});

test("auditing retains only deidentified speaker counts", () => {
  const result = safeCoreContext({
    speaker_attribution: {
      confirmed_by_physician: true,
      speaker_count: 3,
      role_segment_counts: { physician: 3, patient: 2, companion: 1 },
      transcript: "conteúdo que não deve ser retido"
    }
  });
  assert.equal(result.speaker_attribution.role_segment_counts.companion, 1);
  assert.equal(JSON.stringify(result).includes("conteúdo que não deve ser retido"), false);
});

test("zero-click mode labels acoustic speakers without claiming roles", () => {
  const result = buildAutomaticSpeakerTranscript(segments);
  assert.match(result.transcript, /LOCUTOR A \(papel não confirmado\):/);
  assert.match(result.transcript, /LOCUTOR B \(papel não confirmado\):/);
  assert.match(result.transcript, /LOCUTOR C \(papel não confirmado\):/);
  assert.equal(result.speakerAttribution.confirmed_by_physician, false);
  assert.equal(result.speakerAttribution.role_segment_counts.patient, 0);
  assert.equal(result.speakerAttribution.role_segment_counts.companion, 0);
  assert.equal(result.speakerAttribution.role_segment_counts.other, 3);
  assert.equal(result.speakerAttribution.transcript_retained, false);
});
test("zero-click mode does not require role selection and validates malformed segments", () => {
  assert.doesNotThrow(() => buildAutomaticSpeakerTranscript(segments));
  assert.throws(() => buildAutomaticSpeakerTranscript([{speaker:"A",start:7,end:2,text:"erro"}]), /INVALID_SPEAKER_SEGMENTS/);
});
