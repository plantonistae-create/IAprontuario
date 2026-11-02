const {test}=require('node:test');const assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');require('../nexa-radar-controller');
test('remote context omits generated text while retaining patient evidence and safety gaps',()=>{
  const fields={queixa_principal:'Dispneia',hda:'Falta de ar desde hoje.',alergias:'Não informado.',
    comorbidades:'Asma.',medicacoes:'Salbutamol em uso.',hipotese_diagnostica:'Broncoespasmo',
    sugestoes_perguntas:'Perguntas geradas pelo Radar. '.repeat(30),
    orientacoes_alta:'Texto de alta gerado. '.repeat(20),_include_hipotese:true};
  const input={fields,transcript:'Paciente: Estou chiando.',cid:'J45'};
  const compact=NexaRadarController.clinicalContext(fields,input.transcript,input.cid);
  assert.equal(compact.fields.hda,fields.hda);
  assert.equal(compact.fields.medicacoes,fields.medicacoes);
  assert.equal(compact.transcript,input.transcript);
  assert.equal(compact.cid,input.cid);
  assert.equal(compact.fields.sugestoes_perguntas,undefined);
  assert.equal(compact.fields.orientacoes_alta,undefined);
  assert.equal(compact.fields._include_hipotese,undefined);
  assert.ok(JSON.stringify(compact).length<JSON.stringify(input).length/2);
  const old=NexaRadarEngine.analyze(input),next=NexaRadarEngine.analyze(compact);
  assert.deepEqual(next.unresolvedSafety,old.unresolvedSafety);
  assert.deepEqual(next.alerts,old.alerts);
  assert.deepEqual(next.items.map(x=>x.concept),old.items.map(x=>x.concept));
});
test('remote state keeps manual answers without account or encounter identifiers',()=>{
  const snapshot={version:1,owner:'doctor-id',encounter:'encounter-id',ledger:{dyspnea:{action:'answer',value:'Não',section:'hda'}},questionTrace:[{id:'dyspnea'}]};
  const state=NexaRadarController.remoteState(snapshot);
  assert.deepEqual(state,{version:1,ledger:snapshot.ledger});
  assert.ok(!JSON.stringify(state).includes('doctor-id'));
  assert.ok(!JSON.stringify(state).includes('encounter-id'));
});
function fixture(){let context={fields:{hda:'Dor torácica.'}};const calls=[];const adapter={context:()=>context,publish(){},apply:fields=>context={fields},analyze:(c,signal)=>new Promise((resolve,reject)=>calls.push({c,signal,resolve,reject}))};const api=NexaRadarController.create(adapter);api.setOwner('a');api.recalculate();return {api,calls,set:c=>context=c};}
test('obsolete AI result cannot replace newest context or question chronology',async()=>{const {api,calls,set}=fixture();const old=api.analyzeRemote();set({fields:{hda:'Entorse do tornozelo.'}});api.recalculate();const before=api.snapshot().questionEvents;calls[0].resolve({items:[{concept:'saddle',contextEvidence:'Dor torácica.',priority:'critical'}]});await old;assert.ok(!api.state.items.some(i=>i.id==='saddle'));assert.ok(api.state.items.some(i=>i.id==='fourSteps'));assert.deepEqual(api.snapshot().questionEvents,before);});
test('network failure leaves deterministic engine and retry usable',async()=>{const {api,calls}=fixture();const pending=api.analyzeRemote();calls[0].reject(new Error('Network'));await pending;assert.ok(api.state.error);assert.ok(api.state.items.some(i=>i.id==='dyspnea'));assert.equal(api.state.busy,false);const retry=api.analyzeRemote();calls[1].resolve({items:[]});await retry;assert.equal(api.state.error,'');});
test('owner change cancels requests and removes ledger',async()=>{const {api,calls,set}=fixture();api.respond('dyspnea','Não');const pending=api.analyzeRemote();set({fields:{hda:''}});api.setOwner('b');calls[0].resolve({items:[]});await pending;assert.deepEqual(api.snapshot().ledger,{});assert.equal(api.snapshot().owner,'b');assert.equal(api.state.hasContext,false);});
test('foreign persisted state cannot restore answers',()=>{const {api}=fixture();api.restore({version:1,owner:'other',ledger:{dyspnea:{value:'Não'}}},'a');assert.deepEqual(api.snapshot().ledger,{});api.reset();});
test('new encounter resets answers, preserves adapter settings',()=>{const {api,set}=fixture();api.respond('dyspnea','Não');set({fields:{hda:''}});api.reset();assert.deepEqual(api.snapshot().ledger,{});assert.deepEqual(api.state.items.map(i=>i.concept).sort(),['allergies','comorbidities','medicines']);});

test('completed audio items are ordered and idempotent; deltas cannot become findings',()=>{const buffer=NexaRadarController.createTranscriptBuffer();buffer.ingest({type:'input_audio_buffer.committed',item_id:'a'});buffer.ingest({type:'input_audio_buffer.committed',item_id:'b'});assert.equal(buffer.ingest({type:'conversation.item.input_audio_transcription.delta',item_id:'a',delta:'Nega'}),false);assert.equal(buffer.text,'');buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'Não.'});buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'Teve febre?'});assert.equal(buffer.text,'Teve febre?\nNão.');assert.equal(buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'Teve febre?'}),false);buffer.clear();assert.equal(buffer.text,'');});
test('unavailable transcription remains explicit even with no recorded context',()=>{const {api,set}=fixture();set({fields:{hda:''}});api.setTranscriptStatus('unavailable');assert.equal(api.state.transcriptStatus,'unavailable');assert.equal(api.state.hasContext,false);api.reset();assert.equal(api.state.transcriptStatus,undefined);});

test('a later audio success cannot hide an earlier unanalyzed segment',()=>{const {api}=fixture();api.setTranscriptStatus('unavailable');api.setTranscriptStatus('live');assert.equal(api.state.transcriptStatus,'stale');assert.equal(api.state.transcriptIncomplete,true);api.setTranscriptStatus('paused');assert.equal(api.state.transcriptIncomplete,true);api.setTranscriptStatus('structured');assert.equal(api.state.transcriptIncomplete,false);api.reset();});

test('appended speech keeps the current request alive and queues a fresh analysis',async()=>{
  const {api,calls,set}=fixture();
  set({fields:{hda:'Dor torácica.'},transcript:'Médico: Teve febre?'});
  api.recalculate();
  const pending=api.analyzeRemote();
  assert.equal(calls.length,1);
  const signal=calls[0].signal;
  set({fields:{hda:'Dor torácica.'},transcript:'Médico: Teve febre?\nPaciente: Não.'});
  api.recalculate({remote:true});
  assert.equal(signal.aborted,false,'append-only speech must not cancel an active AI call');
  calls[0].resolve({items:[],observations:[]});
  await pending;
  assert.equal(api.state.busy,false);
  assert.equal(api.state.error,'');
  api.reset();
});
test('non-append edits still cancel stale AI requests',async()=>{
  const {api,calls,set}=fixture();
  const pending=api.analyzeRemote();
  const signal=calls[0].signal;
  set({fields:{hda:'Cefaleia súbita.'},transcript:'Mudança de contexto.'});
  api.recalculate();
  assert.equal(signal.aborted,true);
  calls[0].resolve({items:[]});
  await pending;
  api.reset();
});

test('question timeline records appearance, removal and is isolated on reset',()=>{
 const {api,set}=fixture();
 const initial=api.snapshot().questionEvents;
 assert.ok(initial.some(e=>e.type==='appeared'&&e.concept==='dyspnea'));
 assert.ok(initial.every(e=>!('transcript' in e)&&!('patient_text' in e)));
 const oldSeq=initial.at(-1).sequence;
 set({fields:{hda:''}});
 api.recalculate();
 const timeline=api.snapshot().questionEvents;
 assert.ok(timeline.some(e=>e.type==='removed'&&e.concept==='dyspnea'));
 assert.ok(timeline.at(-1).sequence>oldSeq);
 const saved=api.snapshot();
 api.restore(saved,'a');
 assert.ok(api.snapshot().questionEvents.length>=timeline.length);
 api.reset('b');
 assert.equal(api.snapshot().questionEvents.length,0);
});
test('second controller restores chronological removals but rejects duplicate or reversed sequence',()=>{
 const {api,set}=fixture();set({fields:{hda:''}});api.recalculate();
 const saved=api.snapshot(),other=fixture().api;
 other.restore(saved,'a');
 const recovered=other.snapshot().questionEvents;
 assert.ok(recovered.some(e=>e.type==='removed'&&e.concept==='dyspnea'));
 assert.ok(recovered.every((e,i)=>i===0||e.sequence>recovered[i-1].sequence));
 const corrupt={...saved,questionEvents:[...saved.questionEvents].reverse()};
 other.restore(corrupt,'a');
 assert.equal(other.snapshot().questionTraceTruncated,true);
 assert.ok(other.snapshot().questionEvents.every((e,i,rows)=>i===0||e.sequence>rows[i-1].sequence));
});
