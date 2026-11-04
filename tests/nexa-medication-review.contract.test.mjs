import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewMedicationVolume} from '../supabase/functions/_shared/nexa-medication-review.mjs';

test('preserves a reported volume when concentration is unknown',()=>{
 const review=reviewMedicationVolume('Paciente: tomo omeprazol, 5 mL.','Omeprazol (concentração não informada).');
 assert.deepEqual(review.alerts,[{code:'volume_missing',medicine:'omeprazol',reported_name:'omeprazol',amount:'5',unit:'mL'}]);
 assert.equal(review.requires_review,true);
});

test('distinguishes administered volume from milligrams and concentration',()=>{
 const fromTranscript='Paciente: tomei Novalgina 5 mL.';
 assert.equal(reviewMedicationVolume(fromTranscript,'Novalgina 5 mg.').alerts.some(x=>x.code==='volume_missing'),true);
 assert.equal(reviewMedicationVolume(fromTranscript,'Novalgina 5 mL; concentração não informada.').requires_review,false);
 assert.equal(reviewMedicationVolume('Paciente: uso Novalgina 5 mg/mL.','Novalgina 5 mg/mL.').requires_review,false);
});

test('marks name changes for review without substituting original text',()=>{
 const source='Paciente: tomei Novalgina 5 mL.';
 const report=reviewMedicationVolume(source,'Dipirona 5 mL.');
 assert.deepEqual(report.alerts.map(x=>x.code),['reported_name_changed']);
 assert.equal(source,'Paciente: tomei Novalgina 5 mL.');
});

test('keeps unverified brand literal and does not infer ingredient',()=>{
 const report=reviewMedicationVolume('Paciente: uso Celestrat 5 mL.','NÃO RELATADO NA CONSULTA');
 assert.equal(report.alerts[0].reported_name,'celestrat');
 assert.equal(report.alerts[0].medicine,'celestrat');
 assert.equal(report.alerts[0].code,'medication_missing');
 assert.deepEqual(report.alerts[1],{code:'volume_missing',medicine:'celestrat',reported_name:'celestrat',amount:'5',unit:'mL'});
});

test('retains each explicit omission when the whole medication field is absent',()=>{
 const report=reviewMedicationVolume('Paciente: tomo omeprazol, cinco mililitros todos os dias.','NÃO RELATADO NA CONSULTA');
 assert.deepEqual(report.alerts.map(alert=>alert.code),['medication_missing','volume_missing','frequency_missing']);
 assert.deepEqual(report.alerts[1],{code:'volume_missing',medicine:'omeprazol',reported_name:'omeprazol',amount:'5',unit:'mL'});
});

test('does not treat physician question or relative use as patient use',()=>{
 const report=reviewMedicationVolume('Médico: usa omeprazol 5 mL? Minha filha usa Novalgina 5 mL.','NÃO RELATADO NA CONSULTA');
 assert.equal(report.requires_review,false);
});

test('does not assign one volume to two medicines',()=>{
 const report=reviewMedicationVolume('Paciente: tomo omeprazol e Novalgina, 5 mL.','Omeprazol; Novalgina.');
 assert.equal(report.alerts.some(x=>x.code==='volume_missing'),false);
});

test('keeps decimal volumes and does not invent a smaller integer dose',()=>{
 const report=reviewMedicationVolume('Paciente: uso omeprazol 2.5 mL.','Omeprazol 2,5 mL; concentração não informada.');
 assert.equal(report.requires_review,false);
 assert.equal(reviewMedicationVolume('Paciente: uso omeprazol 2.5 mL.','Omeprazol 5 mL.').alerts[0].amount,'2.5');
});

test('negated and third-party mentions do not generate omission warnings',()=>{
 for(const transcript of [
  'Paciente: Não uso Novalgina.',
  'Paciente: Nega uso de omeprazol.',
  'Acompanhante: Eu tomo dipirona 5 mL.',
  'Médico: Usa omeprazol. Novalgina também.'
 ])assert.equal(reviewMedicationVolume(transcript,'NÃO RELATADO NA CONSULTA').requires_review,false,transcript);
});

test('recognizes conservative lexical catalog without inferring an administered presentation',()=>{
 const review=reviewMedicationVolume('Paciente: tomo losartana e metformina.','NÃO RELATADO NA CONSULTA');
 assert.deepEqual(review.alerts.map(a=>a.medicine),['losartana','metformina']);
 assert.ok(review.catalog_version);
 assert.equal(review.alerts.some(a=>a.amount||a.unit),false);
});

test('flags explicit mass, drops, tablets and frequency separately from concentration',()=>{
 const scenarios=[
  ['Paciente: tomo paracetamol 500 mg.','Paracetamol.','quantity_missing','mg'],
  ['Paciente: tomo dipirona 20 gotas.','Dipirona.','quantity_missing','gotas'],
  ['Paciente: tomo metformina 2 comprimidos.','Metformina.','quantity_missing','comprimidos'],
  ['Paciente: tomo losartana diariamente.','Losartana.','frequency_missing',undefined]
 ];
 for(const [transcript,documented,code,unit] of scenarios){
  const flag=reviewMedicationVolume(transcript,documented).alerts.find(a=>a.code===code);
  assert.ok(flag,transcript);if(unit)assert.equal(flag.unit,unit);
 }
 const concentration=reviewMedicationVolume('Paciente: uso dipirona 5 mg/mL.','Dipirona.');
 assert.equal(concentration.alerts.some(a=>a.code==='quantity_missing'||a.code==='volume_missing'),false);
});

test('compares spoken quantities with numeric notation without inventing concentration',()=>{
 const source='Paciente: tomo omeprazol, cinco mililitros. Não sei a concentração.';
 assert.deepEqual(reviewMedicationVolume(source,'Omeprazol 5 mL; concentração não informada.').alerts,[]);
 const omitted=reviewMedicationVolume(source,'Omeprazol; concentração não informada.');
 assert.deepEqual(omitted.alerts,[{code:'volume_missing',medicine:'omeprazol',reported_name:'omeprazol',amount:'5',unit:'mL'}]);
 assert.equal(reviewMedicationVolume('Paciente: a dipirona tem cinco miligramas por mililitro.','Dipirona.').requires_review,false);
 const drops=reviewMedicationVolume('Paciente: tomei vinte gotas de dipirona.','Dipirona.');
 assert.equal(drops.alerts[0].amount,'20');
 assert.equal(drops.alerts[0].unit,'gotas');
});
