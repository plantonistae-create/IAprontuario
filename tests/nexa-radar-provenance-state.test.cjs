const {test}=require('node:test');
const assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');require('../nexa-radar-controller');
const {classifyEvidence:c,evidenceSpeaker:s,evidenceLabels:labels}=NexaRadarController;
const f=(state,quote,section='transcript')=>({state,conflict:false,evidence:quote?[{state,quote,section}]:[],currentEvidence:quote?{state,quote,section}:null});
const ctx=(transcript,fields={})=>({transcript,fields});
test('eleven explicit states and safe unattributed record label exist',()=>{
 for(const id of ['not_asked','awaiting_response','does_not_know','denied_by_patient','denied_by_companion',
 'reported_by_patient','reported_by_companion','confirmed_by_physician','not_applicable','contradictory','uncertain_transcript'])
 assert.ok(labels[id],id);
 assert.equal(Object.keys(labels).length,12);
});
test('silence, questions and clinician speech never become patient denials',()=>{
 assert.equal(c(f('not_asked'),null,ctx('')).code,'not_asked');
 assert.equal(c({...f('not_asked'),asked:{quote:'Médico: Febre?'}},null,ctx('Médico: Febre?')).code,'awaiting_response');
 assert.equal(c(f('unknown','Médico: Febre?'),null,ctx('Médico: Febre?')).resolves_patient_fact,false);
});
test('patient statements are distinguished from companion statements, without reclassifying patient facts',()=>{
 assert.equal(c(f('known_absent','Paciente: Nega febre.'),null,ctx('Paciente: Nega febre.')).code,'denied_by_patient');
 assert.equal(c(f('known_present','Paciente: Apresenta febre.'),null,ctx('Paciente: Apresenta febre.')).code,'reported_by_patient');
 const den=c(f('unknown','Acompanhante: Nega febre.'),null,ctx('Acompanhante: Nega febre.'));
 assert.equal(den.code,'denied_by_companion');assert.equal(den.resolves_patient_fact,false);
 assert.equal(c(f('unknown','Acompanhante: Relata febre.'),null,ctx('Acompanhante: Relata febre.')).code,'reported_by_companion');
});
test('duplicated speech has unknown attribution and no false certainty',()=>{
 const transcript='Paciente: Nega febre.\nAcompanhante: Nega febre.';
 assert.equal(s({section:'transcript',quote:'Nega febre.'},transcript),'unknown');
 const d=c(f('known_absent','Nega febre.'),null,ctx(transcript));
 assert.equal(d.code,'uncertain_transcript');assert.equal(d.confidence,'not_measured');
});
test('explicit unknown does not become denial',()=>{
 const u=c(f('unknown','Paciente: Não sei informar.'),null,ctx('Paciente: Não sei informar.'));
 assert.equal(u.code,'does_not_know');assert.equal(u.resolves_patient_fact,false);
});
test('contradiction outranks manual confirmation; unresolved transcript remains uncertain',()=>{
 const doc={action:'answer',documented:'Febre: presente.',section:'hda'};
 assert.equal(c({...f('known_present','Paciente: Febre.'),conflict:true},doc,ctx('Paciente: Febre.',{hda:'Febre: presente.'})).code,'contradictory');
 assert.equal(c(f('known_present','Relatou febre.'),null,ctx('Relatou febre.'),true).code,'uncertain_transcript');
});
test('only current explicit manual response is physician-confirmed',()=>{
 const doc={action:'answer',documented:'Febre: negado.',section:'hda'};
 assert.equal(c(f('known_absent','Febre: negado.','hda'),doc,ctx('',{hda:'Febre: negado.'})).code,'confirmed_by_physician');
 assert.equal(c(f('known_absent','Febre: negado.','hda'),null,ctx('',{hda:'Febre: negado.'})).code,'documented_unattributed');
 assert.equal(c(f('known_absent','Febre: negado.','hda'),doc,ctx('',{hda:'Mudou.'})).code,'documented_unattributed');
});
test('not applicable is not allowed to conceal a present finding',()=>{
 assert.equal(c(f('not_asked'),{action:'not_applicable'},ctx('')).code,'not_applicable');
 assert.notEqual(c(f('known_present','Paciente: Febre.'),{action:'not_applicable'},ctx('Paciente: Febre.')).code,'not_applicable');
});
test('derived provenance never replaces facts or becomes a persisted second ledger',()=>{
 let data={fields:{hda:'Cefaleia.'},transcript:'Médico: Teve febre?'};
 const api=NexaRadarController.create({context:()=>data,publish(){},analyze:async()=>({items:[],observations:[]})});
 api.setOwner('synthetic-owner');api.recalculate();
 assert.equal(api.state.facts.fever.state,'not_asked');
 assert.ok(api.state.evidenceStates.fever);
 assert.equal(api.state.evidenceStates.fever.resolves_patient_fact,false);
 assert.ok(!JSON.stringify(api.snapshot()).includes('evidenceStates'));api.reset();
});

test('patient uncertainty is not a denial when wording includes sem certeza',()=>{
 for(const quote of ['Paciente: Sem certeza sobre febre.', 'Paciente: Não tenho certeza se tive febre.',
  'Paciente: Não consigo afirmar se tive febre.', 'Paciente: Não recordo se tive febre.']){
  const result=c(f('known_absent',quote),null,ctx(quote));
  assert.equal(result.code,'does_not_know',quote);
  assert.equal(result.resolves_patient_fact,false,quote);
 }
 assert.equal(c(f('known_absent','Paciente: Sem febre.'),null,ctx('Paciente: Sem febre.')).code,'denied_by_patient');
});

test('G16.9 combined: uncertain wording and short speaker quote remain unconfirmed',()=>{
 const t='Paciente: Sim.\nMédico: Você confirma?';
 const q='Paciente informou Sim. e descreveu outros sintomas';
 assert.equal(s({section:'transcript',quote:q},t),'unknown');
 assert.equal(c(f('known_present',q),null,ctx(t)).resolves_patient_fact,false);
 const uncertain='Paciente: Sem certeza sobre febre.';
 assert.equal(c(f('known_absent',uncertain),null,ctx(uncertain)).code,'does_not_know');
 assert.equal(c(f('known_absent',uncertain),null,ctx(uncertain)).resolves_patient_fact,false);
});

test('G17 clinician uncertainty cannot be mislabeled as patient does-not-know',()=>{
 const doctor='Médico: Não sei se houve febre.';
 const result=c(f('unknown',doctor),null,ctx(doctor));
 assert.equal(result.speaker,'doctor');
 assert.equal(result.code,'uncertain_transcript');
 assert.equal(result.resolves_patient_fact,false);
 const ambiguous='Médico: Não sei se houve febre.\nPaciente: Não sei se houve febre.';
 const quote='Não sei se houve febre.';
 assert.equal(c(f('unknown',quote),null,ctx(ambiguous)).code,'uncertain_transcript');
 assert.equal(c(f('unknown',quote),null,ctx(ambiguous)).resolves_patient_fact,false);
 const patient='Paciente: Não sei se houve febre.';
 assert.equal(c(f('unknown',patient),null,ctx(patient)).code,'does_not_know');
});
