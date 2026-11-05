'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');

function clock(){
  const original={now:Date.now,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
  let now=0,nextId=0;const pending=new Map();
  Date.now=()=>now;
  global.setTimeout=(fn,delay=0)=>{const id=++nextId;pending.set(id,{at:now+Number(delay),fn});return id};
  global.clearTimeout=id=>pending.delete(id);
  return {
    tick(ms){const end=now+ms;for(;;){
      const due=[...pending].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
      if(!due)break;now=due[1].at;pending.delete(due[0]);due[1].fn();
    }now=end},
    restore(){Date.now=original.now;global.setTimeout=original.setTimeout;global.clearTimeout=original.clearTimeout}
  };
}
function setup(){
  let context={fields:{hda:'Paciente: Tenho falta de ar.'},transcript:''};
  const calls=[];
  const adapter={context:()=>context,publish(){},apply:fields=>{context={...context,fields}},
    analyze:(input,signal)=>new Promise((resolve,reject)=>calls.push({input,signal,resolve,reject}))};
  const radar=NexaRadarController.create(adapter);radar.setOwner('synthetic-doctor');
  return {radar,calls,set:value=>{context=value}};
}

test('identical updates cannot postpone the first analysis or create duplicate calls',async()=>{
  const timer=clock();try{
    const {radar,calls}=setup();
    radar.recalculate({remote:true});
    for(let i=0;i<12;i++){timer.tick(100);radar.recalculate({remote:true})}
    timer.tick(300);
    assert.equal(calls.length,1,'unchanged UI updates must not postpone the first clinical analysis');
    calls[0].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    radar.recalculate({remote:true});timer.tick(2000);
    assert.equal(calls.length,1,'ACK of unchanged context must prevent a second request');
    radar.reset();
  }finally{timer.restore()}
});

test('append-only speech queues one fresh analysis; red flags and changed fields remain immediate',async()=>{
  const timer=clock();try{
    const {radar,calls,set}=setup();
    radar.recalculate({remote:true});timer.tick(1500);assert.equal(calls.length,1);
    set({fields:{hda:'Paciente: Tenho falta de ar.'},transcript:'Paciente: Estou chiando.'});
    radar.recalculate({remote:true});
    assert.equal(calls[0].signal.aborted,false);
    set({fields:{hda:'Paciente: Tenho falta de ar.'},transcript:'Paciente: Estou chiando.\nPaciente: Dor no peito.'});
    radar.recalculate({remote:true});
    assert.equal(radar.state.facts.chest.state,'known_present','new alarm evidence must be visible locally');
    calls[0].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    timer.tick(1500);assert.equal(calls.length,2,'appended evidence needs one follow-up request');
    calls[1].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    timer.tick(2000);assert.equal(calls.length,2);
    radar.reset();
  }finally{timer.restore()}
});

test('changed clinical fields cancel obsolete work; concurrent calls and failures do not loop',async()=>{
  const timer=clock();try{
    const {radar,calls,set}=setup();
    const first=radar.analyzeRemote(),same=radar.analyzeRemote();
    assert.equal(calls.length,1);await same;
    set({fields:{hda:'Paciente: Dor torácica e síncope.'},transcript:''});
    radar.recalculate({remote:true});
    assert.equal(calls[0].signal.aborted,true);
    calls[0].resolve({items:[]});await first;
    timer.tick(1500);assert.equal(calls.length,2);
    calls[1].reject(new Error('synthetic network failure'));
    await Promise.resolve();await Promise.resolve();timer.tick(2000);
    assert.equal(calls.length,2,'failure cannot trigger repeated paid calls');
    const retry=radar.analyzeRemote();assert.equal(calls.length,3);
    calls[2].resolve({items:[]});await retry;radar.reset();
  }finally{timer.restore()}
});

test('owner and encounter changes reject late results without carrying answers',async()=>{
  const timer=clock();try{
    const {radar,calls}=setup();
    const old=radar.analyzeRemote();radar.setOwner('other-synthetic-doctor');
    assert.equal(calls[0].signal.aborted,true);
    calls[0].resolve({items:[{id:'foreign',concept:'dyspnea',question:'foreign'}]});await old;
    assert.equal(radar.snapshot().owner,'other-synthetic-doctor');
    assert.equal(radar.state.items.some(item=>item.id==='foreign'),false);
    const encounter=radar.snapshot().encounter;radar.reset();
    assert.notEqual(radar.snapshot().encounter,encounter);
  }finally{timer.restore()}
});


test('trailing spaces and tabs in transcript or clinical fields never schedule a second paid analysis',async()=>{
  const timer=clock();try{
    const {radar,calls,set}=setup();
    const fields={hda:'Paciente: Tenho falta de ar.  '};
    set({fields,transcript:'Paciente: Nego febre.   \t'});
    radar.recalculate({remote:true});timer.tick(1500);
    assert.equal(calls.length,1);
    assert.equal(calls[0].input.transcript,'Paciente: Nego febre.   \t',
      'request payload retains literal transcript despite the scheduling key');
    assert.equal(calls[0].input.fields.hda,'Paciente: Tenho falta de ar.  ',
      'clinical fields must remain literal in provider payload');
    set({fields:{hda:'Paciente: Tenho falta de ar.'},transcript:'Paciente: Nego febre.'});
    radar.recalculate({remote:true});
    assert.equal(calls[0].signal.aborted,false,'whitespace-only ASR updates cannot abort a useful request');
    calls[0].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    timer.tick(2000);assert.equal(calls.length,1,
      'trailing formatting alone cannot bill the provider again');
    radar.reset();
  }finally{timer.restore()}
});

test('negation, units, speaker boundaries and clinical fields still trigger remote analysis',async()=>{
  const timer=clock();try{
    const {radar,calls,set}=setup();
    const base={hda:'Paciente: Tenho falta de ar.'};
    set({fields:base,transcript:'Paciente: Não tenho alergias.'});
    radar.recalculate({remote:true});timer.tick(1500);
    assert.equal(calls.length,1);
    calls[0].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    set({fields:base,transcript:'Paciente: Tenho alergias.'});
    radar.recalculate({remote:true});timer.tick(1500);
    assert.equal(calls.length,2,'negation changed');
    calls[1].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    set({fields:base,transcript:'Paciente: Tenho alergias.\nMédico: Qual medicamento?'});
    radar.recalculate({remote:true});timer.tick(1500);
    assert.equal(calls.length,3,'new line and speaker require a fresh interpretation');
    calls[2].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    set({fields:base,transcript:'Paciente: Tomei 10 mg.'});
    radar.recalculate({remote:true});timer.tick(1500);
    assert.equal(calls.length,4,'dosage change is not normalized');
    calls[3].resolve({items:[]});await Promise.resolve();await Promise.resolve();
    set({fields:{hda:'Paciente: Tenho falta de ar e síncope.'},transcript:'Paciente: Tomei 10 mg.'});
    radar.recalculate({remote:true});timer.tick(1500);
    assert.equal(calls.length,5,'clinical field changes must never be suppressed');
    radar.reset();
  }finally{timer.restore()}
});
