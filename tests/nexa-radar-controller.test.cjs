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
test('obsolete AI result cannot replace newest context',async()=>{const {api,calls,set}=fixture();const old=api.analyzeRemote();set({fields:{hda:'Entorse do tornozelo.'}});api.recalculate();calls[0].resolve({items:[{concept:'saddle',contextEvidence:'Dor torácica.',priority:'critical'}]});await old;assert.ok(!api.state.items.some(i=>i.id==='saddle'));assert.ok(api.state.items.some(i=>i.id==='fourSteps'));});
test('network failure leaves deterministic engine and retry usable',async()=>{const {api,calls}=fixture();const pending=api.analyzeRemote();calls[0].reject(new Error('Network'));await pending;assert.ok(api.state.error);assert.ok(api.state.items.some(i=>i.id==='dyspnea'));assert.equal(api.state.busy,false);const retry=api.analyzeRemote();calls[1].resolve({items:[]});await retry;assert.equal(api.state.error,'');});
test('owner change cancels requests and removes ledger',async()=>{const {api,calls,set}=fixture();api.respond('dyspnea','Não');const pending=api.analyzeRemote();set({fields:{hda:''}});api.setOwner('b');calls[0].resolve({items:[]});await pending;assert.deepEqual(api.snapshot().ledger,{});assert.equal(api.snapshot().owner,'b');assert.equal(api.state.hasContext,false);});
test('foreign persisted state cannot restore answers',()=>{const {api}=fixture();api.restore({version:1,owner:'other',ledger:{dyspnea:{value:'Não'}}},'a');assert.deepEqual(api.snapshot().ledger,{});api.reset();});
test('new encounter resets answers, preserves adapter settings',()=>{const {api,set}=fixture();api.respond('dyspnea','Não');set({fields:{hda:''}});api.reset();assert.deepEqual(api.snapshot().ledger,{});assert.deepEqual(api.state.items.map(i=>i.concept).sort(),['allergies','comorbidities','medicines']);});
test('required history accepts an explicit no without turning it into a positive finding',()=>{
  const {api}=fixture();
  assert.throws(()=>api.respond('allergies','Sim'),/descreva/i);
  assert.equal(api.state.facts.allergies.state,'not_asked');
  assert.equal(api.respond('allergies','Não'),true);
  assert.equal(api.state.facts.allergies.state,'known_absent');
  assert.ok(!api.state.items.some(i=>i.concept==='allergies'));
  api.reset();
});

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

test('duplicate or delayed completed transcription cannot rewrite an accepted final turn',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 b.ingest({type:'input_audio_buffer.committed',item_id:'turn-1'});
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-1',transcript:'Paciente: Nega febre.'}),true);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-1',transcript:'Paciente: Tem febre.'}),false);
 assert.equal(b.text,'Paciente: Nega febre.');
 b.clear();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-1',transcript:'Paciente: Tem febre.'}),true);
 assert.equal(b.text,'Paciente: Tem febre.');
});
test('empty completion does not lock a later valid completed transcription',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:''}),false);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'Paciente: Não sei.'}),true);
 assert.equal(b.text,'Paciente: Não sei.');
});

test('delivery event_id alone cannot create a phantom transcript turn',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',event_id:'event-only',transcript:'Paciente: Não.'}),false);
 assert.equal(b.text,'');
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-1',event_id:'delivery-1',transcript:'Paciente: Não.'}),true);
 assert.equal(b.text,'Paciente: Não.');
});

test('unknown event types cannot reserve audio ordering slots',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.delta',item_id:'a',delta:'incompleto'}),false);
 assert.equal(b.ingest({type:'input_audio_buffer.committed',item_id:'b'}),false);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'Paciente: Sim.'}),true);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'Médico: Pergunta?'}),true);
 assert.equal(b.text,'Paciente: Sim.\nMédico: Pergunta?');
});

test('audio item IDs are canonicalized before turn deduplication',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:' item-1 ',transcript:'Primeira fala.'}),true);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'item-1',transcript:'Texto duplicado.'}),false);
 assert.equal(b.text,'Primeira fala.');
});

test('non-text completion payloads cannot become fabricated transcript content',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'item-1',transcript:{text:'Objeto inválido'}}),false);
 assert.equal(b.text,'');
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'item-1',transcript:'Paciente: Sem febre.'}),true);
 assert.equal(b.text,'Paciente: Sem febre.');
});

test('transcript buffer reset isolates a later synthetic consultation after reconnection',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 b.ingest({type:'input_audio_buffer.committed',item_id:'shared-turn'});
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'shared-turn',transcript:'Consulta anterior.'}),true);
 b.clear();
 assert.equal(b.text,'');
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'shared-turn',transcript:'Nova consulta.'}),true);
 assert.equal(b.text,'Nova consulta.');
});
test('out-of-order completion and duplicate commit cannot rewrite an accepted turn',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-A',transcript:'Texto final.'}),true);
 assert.equal(b.ingest({type:'input_audio_buffer.committed',item_id:'turn-A'}),false);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-A',transcript:'Texto atrasado.'}),false);
 assert.equal(b.text,'Texto final.');
});

test('transcription ignores duplicate empty completions and preserves committed order',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'input_audio_buffer.committed',item_id:'first'}),false);
 assert.equal(b.ingest({type:'input_audio_buffer.committed',item_id:'second'}),false);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'second',transcript:'Segunda fala.'}),true);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'first',transcript:'  '}),false);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'first',transcript:'Primeira fala.'}),true);
 assert.equal(b.text,'Primeira fala.\nSegunda fala.');
});

test('session-tagged transcript buffer rejects late callbacks after consultation rotation',()=>{
 const b=NexaRadarController.createTranscriptBuffer('consultation-A');
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-1',transcript:'Primeira consulta.'},'consultation-A'),true);
 b.clear('consultation-B');
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-2',transcript:'Evento atrasado.'},'consultation-A'),false);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-3',transcript:'Sem sessão.'}),false);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-4',transcript:'Segunda consulta.'},'consultation-B'),true);
 assert.equal(b.text,'Segunda consulta.');
});

test('legacy untagged transcript buffer remains compatible across clear',()=>{
 const b=NexaRadarController.createTranscriptBuffer();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'Antes.'}),true);
 b.clear();
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'Depois.'}),true);
 assert.equal(b.text,'Depois.');
});
test('tagged transcript buffer rejects events after explicit session invalidation',()=>{
 const b=NexaRadarController.createTranscriptBuffer('active');
 b.clear(null);
 assert.equal(b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'stale',transcript:'Ignorar.'},'active'),false);
 assert.equal(b.text,'');
});

test('browser realtime event wiring binds buffer ingestion to transport revision and invalidates on wipe',()=>{
 const fs=require('node:fs');const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 assert.match(html,/radarTranscriptBuffer\.ingest\(d,revision\)/);
 assert.match(html,/async function startRealtimeRadar\(mediaStream,\{preserveTranscript=false\}=\{\}\)/);
 assert.match(html,/if\(preserveTranscript\)\{\s*if\(!radarTranscriptBuffer\.rotate\(revision\)\)/);
 assert.match(html,/radarTranscriptBuffer\.clear\(revision\);realtimeTranscript='';realtimeTranscriptDelta=''/);
 assert.match(html,/retryTranscript:\(\)=>\{if\(recording&&stream\)\{stopRealtimeRadar\(\{wipe:false\}\);void startRealtimeRadar\(stream,\{preserveTranscript:true\}\)/);
 assert.match(html,/if\(wipe\)\{radarTranscriptBuffer\.clear\(null\)/);
 assert.match(html,/nexaShowMedicationReview\(payload\.medication_review\);radarTranscriptBuffer\.clear\(null\)/);
});

test('offline lifecycle matrix: reconnect, stale events, timeout, cancellation and final-only transcript',async()=>{
 const {decideOfflineTransportFallback:policy}=await import('../labs/nexa-webrtc/fallback-policy.G7-LAB-ONLY.mjs');
 const b=NexaRadarController.createTranscriptBuffer(1);
 let visibleTranscript='',recording=true,revision=1;
 const deliver=(event,epoch)=>recording&&epoch===revision&&b.ingest(event,epoch);
 const done=(id,text)=>({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:text});
 assert.equal(deliver({type:'input_audio_buffer.committed',item_id:'a'},1),false);
 assert.equal(deliver(done('a','Primeiro turno sintético.'),1),true);
 assert.equal(deliver(done('a','Duplicado.'),1),false);
 assert.equal(visibleTranscript,''); // no transcript panel while recording
 revision=2;b.clear(revision); // reconnect: invalidate callbacks from prior transport
 assert.equal(deliver(done('late','Antigo.'),1),false);
 assert.equal(deliver(done('new','Novo turno sintético.'),2),true);
 assert.equal(b.text,'Novo turno sintético.');
 const flags={localReady:true,confirmedUserCancellation:false};
 const timeout=policy({phase:'webrtc',outcome:'TIMEOUT_BEFORE_HTTP_STATUS'},flags);
 assert.equal(timeout.route,'LOCAL_REVIEW_REQUIRED');
 assert.equal(timeout.automatic_paid_retry,false);
 const cancel=policy({phase:'webrtc',outcome:'CANCELLED_BY_USER'},flags);
 assert.equal(cancel.route,'STOP_CANCELLATION_PROVENANCE_UNVERIFIED');
 assert.equal(cancel.automatic_paid_retry,false);
 recording=false;revision++;visibleTranscript=b.text; // final-only display
 assert.equal(deliver(done('after-stop','Descartar.'),2),false);
 assert.equal(visibleTranscript,'Novo turno sintético.');
 b.clear(null);
 assert.equal(b.ingest(done('after-wipe','Descartar.'),revision),false);
 assert.equal(b.text,'');
});

test('G53 within-consultation WebRTC retry preserves earlier completed text and isolates duplicate IDs',()=>{
 const b=NexaRadarController.createTranscriptBuffer(101);
 const committed=id=>({type:'input_audio_buffer.committed',item_id:id});
 const completed=(id,transcript)=>({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript});
 assert.equal(b.ingest(committed('repeatable'),101),false);
 assert.equal(b.ingest(completed('repeatable','Consulta A: primeira fala.'),101),true);
 assert.equal(b.ingest(committed('unfinished'),101),false);
 assert.equal(b.rotate(102),true);
 assert.equal(b.text,'Consulta A: primeira fala.');
 assert.equal(b.ingest(completed('late','Não inserir fala antiga.'),101),false);
 assert.equal(b.ingest(completed('unfinished','Evento antigo após a rotação.'),101),false);
 assert.equal(b.ingest(completed('repeatable','Consulta A: segunda fala.'),102),true);
 assert.equal(b.ingest(completed('repeatable','Duplicação do transporte atual.'),102),false);
 assert.equal(b.text,'Consulta A: primeira fala.\\nConsulta A: segunda fala.');
 assert.equal(b.rotate(103),true);
 assert.equal(b.ingest(completed('third','Consulta A: terceira fala.'),103),true);
 assert.equal(b.text,'Consulta A: primeira fala.\\nConsulta A: segunda fala.\\nConsulta A: terceira fala.');
});

test('G53 explicit new consultation wipes prior turns while previous transport callbacks are rejected',()=>{
 const b=NexaRadarController.createTranscriptBuffer(22);
 const completed=(id,transcript)=>({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript});
 b.ingest(completed('shared','Consulta antiga.'),22);
 b.clear(23);
 assert.equal(b.text,'');
 assert.equal(b.ingest(completed('shared','Antiga atrasada.'),22),false);
 assert.equal(b.ingest(completed('shared','Nova consulta.'),23),true);
 assert.equal(b.text,'Nova consulta.');
 b.clear(null);
 assert.equal(b.rotate(24),false,'invalidated buffer must not resume without a new consultation');
 assert.equal(b.ingest(completed('late','Ignorar.'),23),false);
 assert.equal(b.text,'');
});

test('G53 invalid transport rotation never accepts an implicit or inherited session',()=>{
 const b=NexaRadarController.createTranscriptBuffer('session-A');
 const completed={type:'conversation.item.input_audio_transcription.completed',item_id:'id',transcript:'Fala válida.'};
 assert.equal(b.ingest(completed,'session-A'),true);
 for(const wrong of [null,undefined,0,-1,NaN,{},'', '  ','x'.repeat(129),'session-A']){
  assert.equal(b.rotate(wrong),false);
  assert.equal(b.text,'Fala válida.');
 }
 assert.equal(b.ingest({...completed,item_id:'missing'},'session-B'),false);
 assert.equal(b.rotate('session-B'),true);
 assert.equal(b.ingest({...completed,item_id:'new'},'session-A'),false);
 assert.equal(b.ingest({...completed,item_id:'new'},'session-B'),true);
});

test('G53 browser new-recording path is distinct from deliberate retry and does not feed stale text to Radar',()=>{
 const fs=require('node:fs');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 assert.match(html,/mediaRecorder\.start\(\);recording=true;seconds=0;\$\('timer'\)\.textContent='00:00';startRealtimeRadar\(stream\);radarAnalyze\(false\)/);
 assert.match(html,/retryTranscript:\(\)=>\{if\(recording&&stream\)\{stopRealtimeRadar\(\{wipe:false\}\);void startRealtimeRadar\(stream,\{preserveTranscript:true\}\)/);
 assert.match(html,/if\(wipe\)\{radarTranscriptBuffer\.clear\(null\);realtimeTranscript='';realtimeTranscriptDelta=''/);
 assert.match(html,/nexaShowMedicationReview\(payload\.medication_review\);radarTranscriptBuffer\.clear\(null\)/);
});
