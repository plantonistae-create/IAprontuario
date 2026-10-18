import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeHdaSource } from "../supabase/functions/_shared/nexa-hda-source-guard.mjs";
import { buildAutomaticSpeakerTranscript, buildVerifiedSpeakerTranscript } from "../supabase/functions/_shared/nexa-speaker-contract.mjs";

const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const processor=readFileSync(new URL("../supabase/functions/process-consultation/index.ts",import.meta.url),"utf8");
const recordingToolbar=readFileSync(new URL("../nexa-final-ui-v18.js",import.meta.url),"utf8");

test("normal doctor/patient consultation defaults to faster standard transcription",()=>{
  assert.match(index,/id="identifySpeakers" type="checkbox" autocomplete="off"/);
  assert.doesNotMatch(index,/id="identifySpeakers" type="checkbox" checked/);
  assert.match(index,/for\(const id of \['identifySpeakers','identifySpeakersLegacy','identifySpeakersToolbar'\]\)/);
  assert.match(index,/else payload=await invoke\(audioBlob\)/);
  assert.match(index,/segments=await nexaDiarizeAudio\(audioBlob\)/);
  assert.match(index,/speaker_identification_duration_ms:speakerIdentificationMs/);
});

test("multiple interlocutors opt-in is placed beside both transcription buttons and defaults off",()=>{
  const start=index.indexOf('<div class="card"><h3>Consentimento</h3>');
  const consentEnd=index.indexOf('</div><div class="card rec-zone">',start);
  assert.ok(start>=0&&consentEnd>start);
  assert.doesNotMatch(index.slice(start,consentEnd),/identifySpeakers/);
  assert.equal((index.match(/id="identifySpeakers" type="checkbox" autocomplete="off"/g)||[]).length,1);
  assert.equal((index.match(/id="identifySpeakersLegacy" type="checkbox" autocomplete="off"/g)||[]).length,1);
  const first=index.indexOf('id="identifySpeakers"');
  const radarButton=index.indexOf('id="nexaRadarProcessBtn"');
  const second=index.indexOf('id="identifySpeakersLegacy"');
  const standardButton=index.indexOf('id="processBtn"');
  assert.ok(first<radarButton&&radarButton-first<650);
  assert.ok(second<standardButton&&standardButton-second<650);
  assert.equal((index.match(/<strong>Múltiplos interlocutores<\/strong>/g)||[]).length,2);
  assert.match(recordingToolbar,/id="identifySpeakersToolbar" type="checkbox" autocomplete="off"/);
  assert.match(recordingToolbar,/id="nfProcess".*?Transcrever e estruturar.*?id="identifySpeakersToolbar"/s);
  assert.match(index,/#nfRecActions>\.nf-speaker-optin\{grid-column:1\/-1/);
  assert.match(index,/keys=\['identifySpeakers','identifySpeakersLegacy','identifySpeakersToolbar'\]/);
  assert.match(index,/document\.addEventListener\('change',event=>\{/);
  assert.match(index,/sync\(false\)/);
  assert.match(index,/sync\(Boolean\(event\.target\.checked\)\)/);
  assert.match(index,/const input=\$\(id\);if\(input\)input\.checked=false/);
  assert.match(index,/Reset whichever controls exist/);
  assert.match(index,/if\(\$\('identifySpeakers'\)\?\.checked\)/);
  assert.match(index,/\.nexa-speaker-optin:focus-within/);
});

test("patient first-person ocular history cannot become an invented participant",()=>{
  const transcript=buildAutomaticSpeakerTranscript([
    {speaker:"A",start:0,end:1,text:"Qual a queixa?"},
    {speaker:"B",start:1,end:4,text:"Acordei com dor ocular intensa há três dias."}
  ]).transcript;
  const original={hda:"OUTRO PARTICIPANTE RELATA QUADRO OCULAR HÁ 3 DIAS.",alergias:"Não informado."};
  const output=normalizeHdaSource(original,transcript);
  assert.equal(output.hda,"Paciente relata QUADRO OCULAR HÁ 3 DIAS.");
  assert.equal(output.alergias,original.alergias);
  assert.equal(original.hda,"OUTRO PARTICIPANTE RELATA QUADRO OCULAR HÁ 3 DIAS.");
});

test("a clearly identified companion is named Acompanhante and never Outros",()=>{
  const segments=[
    {speaker:"A",start:0,end:1,text:"O que houve?"},
    {speaker:"B",start:1,end:4,text:"Sou a mãe, minha filha está com secreção ocular."}
  ];
  const unverified=buildAutomaticSpeakerTranscript(segments);
  const input={hda:"OUTRO PARTICIPANTE RELATA QUADRO DE SECREÇÃO OCULAR."};
  assert.equal(normalizeHdaSource(input,unverified.transcript).hda,"Acompanhante relata QUADRO DE SECREÇÃO OCULAR.");
  const confirmed=buildVerifiedSpeakerTranscript(segments,{A:"physician",B:"other"});
  assert.match(confirmed.transcript,/ACOMPANHANTE:/);
  assert.doesNotMatch(confirmed.transcript,/OUTRO PARTICIPANTE/);
});

test("no clinical role is fabricated when attribution is not grounded",()=>{
  const vague={hda:"OUTRO PARTICIPANTE RELATA QUADRO DE DOR."};
  const out=normalizeHdaSource(vague,"LOCUTOR A (papel não confirmado): Há dor.").hda;
  assert.equal(out,"Durante a consulta, foi relatado QUADRO DE DOR.");
  assert.doesNotMatch(out,/Paciente refere|Acompanhante relata|Outro participante/);
  const normal={hda:"Paciente refere secreção ocular sem febre.",outra_chave:{x:1}};
  assert.equal(normalizeHdaSource(normal,"texto"),normal);
});

test("mixed patient and companion speech does not guess which one owns a generic sentence",()=>{
  const input={hda:"OUTRO PARTICIPANTE RELATA DOR OCULAR."};
  const transcript="LOCUTOR A (papel não confirmado): Acordei com dor ocular.\\nLOCUTOR B (papel não confirmado): Sou a mãe.";
  assert.equal(normalizeHdaSource(input,transcript).hda,"Durante a consulta, foi relatado DOR OCULAR.");
});

test("clinical processing guard applies to both providers before clinical assistance",()=>{
  assert.equal((processor.match(/normalizeHdaSource\(rawDocs,transcript\)/g)||[]).length,2);
  assert.match(processor,/NÃO use a expressão "Outro participante"/);
  assert.match(processor,/nunca "Outro participante relata"/);
  assert.match(processor,/Não considere pergunta, hipótese ou sugestão feita pelo profissional como relato de sintoma ou negativa do paciente/);
});
