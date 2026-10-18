import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildAutomaticSpeakerTranscript,
  buildVerifiedSpeakerTranscript,
} from "../supabase/functions/_shared/nexa-speaker-contract.mjs";

const processing=readFileSync(new URL("../supabase/functions/process-consultation/index.ts",import.meta.url),"utf8");
const start=processing.indexOf("function documentationPrompt(");
const end=processing.indexOf("function assistancePrompt(",start);
assert.ok(start>=0 && end>start,"clinical documentation prompt must exist");
const docPrompt=processing.slice(start,end);

const twoPerson=[
 {speaker:"A",start:0,end:2,text:"Quando começaram os sintomas?"},
 {speaker:"B",start:2,end:6,text:"Acordei com dor ocular intensa hoje."},
 {speaker:"A",start:6,end:7,text:"Tem febre?"},
 {speaker:"B",start:7,end:8,text:"Não."},
];
const accompanied=[
 {speaker:"A",start:0,end:2,text:"Como começaram os sintomas?"},
 {speaker:"B",start:2,end:4,text:"Acordei com dor de cabeça."},
 {speaker:"C",start:4,end:7,text:"Sou a mãe e ela ficou sonolenta."},
];
const doctorAndCompanion=[
 {speaker:"A",start:0,end:2,text:"O que houve com a criança?"},
 {speaker:"B",start:2,end:5,text:"Sou a mãe, meu filho ficou com febre ontem."},
];

test("two speakers in automatic diarization do not imply a companion",()=>{
 const input=buildAutomaticSpeakerTranscript(twoPerson);
 assert.equal(input.speakerAttribution.speaker_count,2);
 assert.equal(input.speakerAttribution.confirmed_by_physician,false);
 assert.equal(input.speakerAttribution.role_segment_counts.companion,0);
 assert.match(input.transcript,/LOCUTOR B \(papel não confirmado\): Acordei com dor ocular intensa hoje/);
 assert.match(docPrompt,/Dois locutores detectados NÃO demonstram presença de acompanhante/);
 assert.match(docPrompt,/ABERTURA PREFERENCIAL NA CONSULTA MÉDICO-PACIENTE: "Paciente refere/);
 assert.match(docPrompt,/Paciente refere ter despertado com dor ocular intensa/);
});

test("no automatic role assignment by speaker number",()=>{
 assert.match(docPrompt,/NÃO presuma que LOCUTOR A é médico ou LOCUTOR B é paciente/);
 assert.match(docPrompt,/A dúvida da diarização, sozinha, NÃO justifica "Relato colhido na consulta"/);
 assert.doesNotMatch(docPrompt,/Quando não for possível determinar com segurança se a fala é do paciente ou acompanhante, use/);
});

test("verified companion is preserved and third party cannot be relabeled as patient",()=>{
 const input=buildVerifiedSpeakerTranscript(accompanied,{A:"physician",B:"patient",C:"companion"});
 assert.equal(input.speakerAttribution.role_segment_counts.companion,1);
 assert.match(input.transcript,/ACOMPANHANTE: Sou a mãe/);
 assert.match(docPrompt,/Só utilize "Acompanhante refere", "Acompanhante relata", "Mãe refere" ou equivalente quando houver evidência clara/);
 assert.match(docPrompt,/mantenha separados os relatos de paciente e acompanhante/);
 const other=buildAutomaticSpeakerTranscript(doctorAndCompanion);
 assert.equal(other.speakerAttribution.speaker_count,2);
 assert.match(docPrompt,/sou a mãe/);
 assert.match(docPrompt,/NÃO solicite confirmação dos locutores/);
});

test("clinical negatives and doctor questions are never inferred",()=>{
 assert.match(docPrompt,/Não considere pergunta, hipótese ou sugestão feita pelo profissional como relato de sintoma ou negativa do paciente/);
 assert.match(docPrompt,/não atribua dados ao paciente/);
 assert.match(docPrompt,/Sem demais queixas/);
});

test("documentation policy is shared by OpenAI and Gemini routes",()=>{
 const calls=processing.match(/documentationPrompt\(/g)||[];
 assert.equal(calls.length,3,"one prompt function and one call per provider");
 assert.match(processing,/buildAutomaticSpeakerTranscript\(body\?\.segments\)/);
 assert.match(docPrompt,/Na consulta usual entre médico e paciente/);
});
