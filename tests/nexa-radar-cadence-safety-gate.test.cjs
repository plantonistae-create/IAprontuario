'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PRODUCTION_GATE_ENABLED,decideConservativeDeferral,auditCadenceSafety}=
  require('../experimental/nexa-radar-cadence-safety-gate.cjs');

const scenarios=[
 {area:'respiratória',initial:'Paciente com tosse há dois dias.',
  alert:'Paciente: Falta de ar progressiva.'},
 {area:'gastrointestinal',initial:'Paciente com diarreia há dois dias.',
  alert:'Paciente: Agora apareceu sangue nas fezes.'},
 {area:'osteomuscular',initial:'Paciente: Dor no joelho direito.',
  alert:'Paciente: Sofri trauma e não consigo apoiar o pé.'},
 {area:'neurológica',initial:'Paciente: Cefaleia hoje.',
  alert:'Paciente: A cefaleia iniciou de repente.'},
 {area:'cardiovascular',initial:'Paciente com palpitações.',
  alert:'Paciente: Tive desmaio hoje.'}
];
function evt(atMs,transcript,fields={hda:'Consulta sintética'},more={}){
 return {atMs,transcript,fields,recordingState:'recording',
   owner:'synthetic-user',encounter:'synthetic-encounter',...more};
}
function series(scenario){
 const lines=[scenario.initial];
 const events=[];
 for(let i=0;i<9;i++){
  if(i>0)lines.push(i===3?scenario.alert:'Médico: Confirma informações '+i+'?');
  events.push(evt(8000*i,lines.join('\n'),{hda:scenario.initial},{
    // Explicitly false to prove actual engine + context changes, not oracle labels,
    // control the gate.
    urgent:false
  }));
 }
 return events;
}

test('strictly offline and fail-closed: no runtime import from clinical code',()=>{
 assert.equal(PRODUCTION_GATE_ENABLED,false);
 for(const path of ['index.html','nexa-radar-controller.js',
  'supabase/functions/realtime-radar/index.ts','supabase/functions/realtime-call/index.ts']){
  const src=readFileSync(path,'utf8');
  assert.doesNotMatch(src,/nexa-radar-cadence-safety-gate/);
 }
});

for(const scenario of scenarios){
 test(scenario.area+': each 8s clinically distinct turn requires timely remote interpretation',()=>{
  const input=series(scenario);
  const result=auditCadenceSafety(input);
  assert.equal(result.productionGateEnabled,false);
  assert.equal(result.candidateSafeForProduction,false);
  assert.deepEqual(result.comparisons.map(x=>x.cadenceMs),[1500,12000,16000]);
  assert.equal(result.decisions.every(x=>x.requiresRemoteReview===true),true);
  assert.equal(result.comparisons[0].unsafeDeferrals,0);
  for(const candidate of result.comparisons.slice(1)){
   assert.ok(candidate.unsafeDeferrals>0,
    'unknown new symptoms may wait for remote AI in hypothetical slower cadence');
   assert.ok(candidate.maxDelayMs>0);
   assert.equal(candidate.localEvaluations,9,'local motor must analyze all ASR chunks');
   assert.equal(candidate.suitableForClinicalActivation,false);
  }
  const danger=result.decisions[3];
  assert.equal(danger.allowDelay,false);
  assert.equal(danger.allowSkip,false);
 });
}

test('unknown atypical symptom blocks deferral even if local findings do not change',()=>{
 const before=evt(0,'Paciente: Palpitações desde hoje.');
 const after=evt(8000,'Paciente: Palpitações desde hoje.\nPaciente: Senti uma sensação estranha diferente.');
 const d=decideConservativeDeferral(before,after);
 assert.equal(d.requiresRemoteReview,true);
 assert.equal(d.allowDelay,false);
 assert.equal(d.allowSkip,false);
 assert.equal(d.reason,'NEW_UNRECOGNIZED_EVIDENCE');
});

test('negation, dose/unit, speaker, contradictions and CID never become ignorable updates',()=>{
 const examples=[
  ['Paciente: Nego desmaios.','Paciente: Tive desmaios.'],
  ['Paciente: Uso 5 mg ao dia.','Paciente: Uso 50 mg ao dia.'],
  ['Paciente: Eu desmaiei.','Acompanhante: Eu desmaiei.'],
  ['Paciente: Sem alergias.','Paciente: Relato alergia a dipirona.'],
  ['Paciente: Sem falta de ar.','Paciente: Agora tenho falta de ar.'],
  ['Paciente: Sem sangue nas fezes.','Paciente: Vejo sangue nas fezes.']
 ];
 for(const [before,after] of examples){
  const d=decideConservativeDeferral(evt(0,before),evt(8000,after));
  assert.equal(d.requiresRemoteReview,true,after);
  assert.equal(d.allowDelay,false,after);
  assert.equal(d.allowSkip,false,after);
 }
 const baseline=evt(0,'Paciente: Dor lombar.',{hda:'Sem fraqueza.'},{cid:'M54.5'});
 const changeCid=evt(8000,'Paciente: Dor lombar.',{hda:'Sem fraqueza.'},{cid:'M54.4'});
 const changeField=evt(8000,'Paciente: Dor lombar.',{hda:'Agora apresenta fraqueza.'},{cid:'M54.5'});
 for(const x of [changeCid,changeField])
  assert.equal(decideConservativeDeferral(baseline,x).requiresRemoteReview,true);
});

test('recording end, pause, loss, owner swap and encounter replacement require active gate',()=>{
 const before=evt(0,'Paciente: Dor torácica.');
 for(const state of ['paused','stopped','stale','unavailable']){
  const d=decideConservativeDeferral(before,{...before,recordingState:state});
  assert.equal(d.requiresRemoteReview,true);
  assert.equal(d.allowSkip,false);
  if(state==='stopped')assert.equal(d.flushRequired,true);
 }
 for(const change of [{owner:'other-synthetic-user'}, {encounter:'another-synthetic-encounter'}]){
  const d=decideConservativeDeferral(before,{...before,...change});
  assert.equal(d.reason,'IDENTITY_OR_ENCOUNTER_CHANGE');
 }
 const stopped=evt(8000,before.transcript,before.fields,{recordingState:'stopped'});
 const report=auditCadenceSafety([before,stopped]);
 assert.ok(report.comparisons[2].unsafeDeferrals>0,
  'simulator delays final-state flush if cadence extension is naively applied');
});

test('only exact repeats or trailing horizontal whitespace may skip a duplicate remote request',()=>{
 const a=evt(0,'Paciente: Sem sintomas novos.  \t',{hda:'Dores no joelho.\t'});
 const b=evt(8000,'Paciente: Sem sintomas novos.',{hda:'Dores no joelho.'});
 const d=decideConservativeDeferral(a,b);
 assert.deepEqual(d,{
  allowSkip:true,allowDelay:false,requiresRemoteReview:false,
  reason:'EXACT_OR_TRAILING_WHITESPACE_DUPLICATE'
 });
 // Newline and punctuation are clinical structure, not trailing whitespace.
 for(const v of ['Paciente: Sem sintomas novos.\n','Paciente: Sem sintomas novos?',
  'Paciente: sem sintomas novos.']){
  assert.equal(decideConservativeDeferral(b,{...b,transcript:v}).allowSkip,false);
 }
});

test('malformed or missing contexts fail closed and do not disclose case text in output',()=>{
 const before=evt(0,'Paciente: Diz dados clínicos privados (sintético).');
 const after={...before,fields:['invalid']};
 const denied=decideConservativeDeferral(before,after);
 assert.equal(denied.reason,'INVALID_OR_UNKNOWN_CONTEXT');
 assert.equal(denied.requiresRemoteReview,true);
 assert.equal(decideConservativeDeferral(null,before).reason,'FIRST_EVIDENCE');
 const update=decideConservativeDeferral(before,{
  ...before,transcript:before.transcript+'\nPaciente: Sinal incomum.'});
 assert.equal(JSON.stringify(update).includes('privados'),false,
  'no clinical text must appear in synthetic safety reports');
});
