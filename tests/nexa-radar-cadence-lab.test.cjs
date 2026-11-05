'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const Engine=require('../nexa-radar-engine');
const {
 CANDIDATE_ENABLED_IN_PRODUCTION, simulateRadarCadence, compareRadarCadences
}=require('../experimental/nexa-radar-cadence-lab.cjs');

const cases=[
 {area:'respiratória',initial:'Paciente: Tosse seca há dois dias.',
  danger:'Paciente: Estou com falta de ar.',fact:'dyspnea'},
 {area:'gastrointestinal',initial:'Paciente: Diarreia aquosa desde ontem.',
  danger:'Paciente: Notei sangue nas fezes.',fact:'stoolBlood'},
 {area:'osteomuscular',initial:'Paciente: Dor no joelho direito.',
  danger:'Paciente: Sofri trauma no joelho e não consigo apoiar.',fact:'trauma'},
 {area:'neurológica',initial:'Paciente: Cefaleia desde ontem.',
  danger:'Paciente: A cefaleia começou de repente.',fact:'sudden'},
 {area:'cardiovascular',initial:'Paciente: Palpitações desde hoje.',
  danger:'Paciente: Tive desmaios.',fact:'syncope'}
];
function fixture(c,{urgent=true}={}){
 const lines=[c.initial],events=[];
 for(let i=0;i<9;i++){
  if(i>0)lines.push(i===3?c.danger:'Médico: Continuando entrevista '+i+'.');
  events.push({atMs:i*8000,fields:{hda:c.initial},transcript:lines.join('\n'),
   urgent:urgent&&i===3});
 }
 return events;
}
function localAnalyze(context){
 const s=Engine.analyze(context);
 return {facts:s.facts,alerts:s.alerts,criticalCount:s.criticalCount,hasContext:s.hasContext};
}

test('candidate is offline and disconnected from clinical production',()=>{
 assert.equal(CANDIDATE_ENABLED_IN_PRODUCTION,false);
 for(const file of ['index.html','nexa-radar-controller.js',
    'supabase/functions/realtime-radar/index.ts','supabase/functions/realtime-call/index.ts']){
  assert.doesNotMatch(readFileSync(file,'utf8'),/nexa-radar-cadence-lab/);
 }
 const ui=readFileSync('index.html','utf8');
 assert.ok(ui.includes("radarChunkStopper=setTimeout(()=>{if(rec.state!=='inactive')rec.stop();},8000)"), 'the current fallback records at 8 seconds per chunk');
});

for(const c of cases){
 test(c.area+': 8s ASR chunks vs current / 12s / 16s with immediate idealized safety bypass',()=>{
  const events=fixture(c);
  const urgentLocal=localAnalyze(events[3]);
  assert.equal(urgentLocal.hasContext,true);
  assert.equal(urgentLocal.facts[c.fact].state,'known_present',
   'synthetic risk evidence must be identified locally: '+c.fact);
  const o=compareRadarCadences(events,localAnalyze);
  const [base,twelve,sixteen]=o.comparison;
  assert.equal(o.candidateEnabledInProduction,false);
  assert.deepEqual(o.comparison.map(x=>x.intervalMs),[1500,12000,16000]);
  assert.deepEqual(o.comparison.map(x=>x.calls),[9,7,6]);
  assert.deepEqual(o.comparison.map(x=>x.callsAvoidedVsCurrent),[0,2,3]);
  assert.deepEqual(o.comparison.map(x=>x.reductionPct),[0,22.22,33.33]);
  for(const result of [base,twelve,sixteen]){
   assert.equal(result.localUpdates,events.length,
     'all local rule/alert evaluations must remain immediate at each chunk');
   assert.equal(result.finalTranscriptCovered,true);
   assert.deepEqual(result.urgentRemoteDelayMs,[0],
     'annotated critical event must bypass the simulated remote cadence');
  }
  const old=simulateRadarCadence(events,{cadenceMs:1500,localAnalyze});
  const long=simulateRadarCadence(events,{cadenceMs:16000,localAnalyze});
  assert.deepEqual(long.localAnalysisTimes,old.localAnalysisTimes);
  assert.equal(long.evidenceDelaysMs[3],0);
 });
}

test('known negation, dosage, speaker and contradiction changes may bypass a cadence only with a validated urgency detector',()=>{
 const base=fixture(cases[0]);
 const variants=[
  'Paciente: NÃO tenho dispneia.',
  'Paciente: Tomei 5 mg, não 50 mg.',
  'Acompanhante: Fui eu que desmaiei.',
  'Paciente: Antes neguei dor, agora relato dor intensa.'
 ];
 for(const variant of variants){
  const events=base.map(e=>({...e}));
  events[3]={...events[3],transcript:events[2].transcript+'\n'+variant,urgent:true};
  const summary=compareRadarCadences(events,localAnalyze);
  assert.deepEqual(summary.comparison.map(x=>x.urgentRemoteDelayMs),[[0],[0],[0]]);
  assert.equal(summary.candidateEnabledInProduction,false);
 }
});

test('without a validated urgency detector a clinically important unknown phrase CAN be delayed; release gate must fail closed',()=>{
 const events=fixture(cases[4],{urgent:false});
 // This is not an assertion of medical safety. It documents a remaining risk.
 events[3].transcript=events[2].transcript+'\nPaciente: Senti um fenômeno neurológico incomum.';
 const fast=simulateRadarCadence(events,{cadenceMs:1500,localAnalyze});
 const slow=simulateRadarCadence(events,{cadenceMs:16000,localAnalyze});
 assert.equal(fast.evidenceDelaysMs[3],0);
 assert.ok(slow.evidenceDelaysMs[3]>0,
  'unknown or atypical danger could reach remote AI later; do not activate the candidate');
 assert.equal(CANDIDATE_ENABLED_IN_PRODUCTION,false);
});

test('simulator fails closed for unsupported cadence, invalid event order and missing local evidence',()=>{
 const casesBad=[
  [{atMs:8000,transcript:'x',fields:{}},{atMs:8000,transcript:'y',fields:{}}],
  [{atMs:0,transcript:'x',fields:null}],
  [{atMs:0,transcript:'x',fields:[]}]
 ];
 for(const events of casesBad)
  assert.throws(()=>simulateRadarCadence(events),/INVALID_RADAR_CADENCE/);
 assert.throws(()=>simulateRadarCadence(fixture(cases[0]),{cadenceMs:30000}),/UNAPPROVED_RADAR_CADENCE/);
 assert.throws(()=>simulateRadarCadence([],{}),/INVALID_RADAR_CADENCE_EVENTS/);
});
