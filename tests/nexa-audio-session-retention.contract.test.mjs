import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Sprint 1 (frontend): the clinical note and the audio are different things.
// Saving the local note must NOT discard the audio; the audio is session-only
// and is never reported as archived. All data below is synthetic.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const slice=(from,to)=>{const a=html.indexOf(from),b=html.indexOf(to,a);assert.ok(a>0&&b>a,'missing: '+from);return html.slice(a,b)};
const processSrc=slice('async function processAudio(){',"}$('processBtn').onclick=processAudio;")+'}';
const noticeSrc=slice('function nexaSetAudioArchiveNotice(state){','async function processAudio(){');

function el(){return{textContent:'',hidden:true,disabled:false,dataset:{},checked:false}}
function harness({persist='ok',invokeFails=false}={}){
  const els={};const $=id=>els[id]||(els[id]=el());
  const toasts=[],events=[],markers=[];
  const factory=new Function('$','show','document','window','CustomEvent','persist','invokeFails','markers',`
    let audioBlob=Object.assign(new Blob(['synthetic-audio']),{});let chunks=['c1'];
    let clinicalEpoch=1,recording=false,mediaRecorder=null,currentProf={id:'synthetic'};
    let activeHistoryId='x',realtimeTranscript='',realtimeTranscriptDelta='',lastProcessedMeta=null;
    let seconds=3;const nexaAudioMarkerWrite=(st,sec)=>{markers.push([st,sec])};
    const stopRecordingTimer=()=>{},stopRec=()=>{},collect=()=>({}),fill=()=>{},nexaShowMedicationReview=()=>{},initHypothesisReview=()=>{};
    const normalizeOutput=o=>o,radarTranscriptBuffer={clear(){}},APP_CONFIG={appVersion:'t'},NexaRadarEngine={norm:s=>String(s||'')};
    const nexaDiarizeAudio=async()=>null,nexaInvokeAutomaticSpeakerSegments=async()=>({fields:{}});
    const invoke=async()=>{if(invokeFails)throw new Error('falha sintética');return{fields:{hda:'Dor sintética'}}};
    const nexaPersistSession=async()=>{if(persist!=='ok')throw new Error('SAVE_FAILED')};
    ${noticeSrc}
    ${processSrc}
    return{processAudio,blob:()=>audioBlob,chunks:()=>chunks};`);
  const h=factory($,(m,err)=>toasts.push({m,err}),{body:{dataset:{}}},
    {dispatchEvent:e=>events.push(e.type)},CustomEvent,persist,invokeFails,markers);
  return{...h,els,toasts,events,markers};
}

test('local note saved: audio and chunks are kept and clearly marked not archived',async()=>{
  const h=harness();await h.processAudio();
  assert.ok(h.blob(),'audioBlob must survive the local note save');
  assert.equal(h.chunks().length,1,'chunks must survive');
  assert.equal(h.blob().nexaTranscribed,true);
  const n=h.els.audioArchiveNotice;
  assert.equal(n.hidden,false);assert.equal(n.dataset.audioArchive,'session_only');
  assert.match(n.textContent,/NÃO arquivado/);assert.match(n.textContent,/fechar ou recarregar/);
  assert.match(h.els.status.textContent,/Prontuário salvo/);
  assert.doesNotMatch(h.toasts.map(t=>t.m).join(' '),/áudio (foi )?arquivado/i);
  assert.deepEqual(h.markers,[['transcribed',3]],'loss marker records only state+seconds, never audio');
});

test('local save failure: no false success, audio kept, state visible',async()=>{
  const h=harness({persist:'fail'});await h.processAudio();
  assert.ok(h.blob());assert.equal(h.blob().nexaTranscribed,undefined,'not marked as saved');
  assert.match(h.els.status.textContent,/NÃO salva/);
  assert.equal(h.toasts.at(-1).err,true);
  assert.equal(h.els.audioArchiveNotice.dataset.audioArchive,'session_only');
  assert.equal(h.events.includes('nexa:clinical-structured'),false,'no structured-success event');
});

test('transcription failure: audio kept, retry allowed, no success state',async()=>{
  const h=harness({invokeFails:true});await h.processAudio();
  assert.ok(h.blob());assert.equal(h.chunks().length,1);
  assert.match(h.els.status.textContent,/Falha ao transcrever/);
  assert.equal(h.els.processBtn.disabled,false,'retry must stay possible');
  assert.equal(h.events.includes('nexa:clinical-structured'),false);
});

test('after a successful note the paid transcription is not re-triggered by accident',async()=>{
  const h=harness();await h.processAudio();
  assert.equal(h.els.processBtn.disabled,true);
});

test('source never declares audio archived and only reset/explicit confirm discards it',()=>{
  assert.equal(/Áudio arquivado|áudio foi arquivado|audio_archived|Áudio salvo/.test(html),false);
  assert.match(html,/audio_saved:'Áudio só na memória \(não arquivado\)'/);
  const body=processSrc;
  assert.equal(/audioBlob=null/.test(body),false,'processAudio must never null the audio');
  assert.equal(/chunks=\[\]/.test(body),false);
  assert.equal(/nexaSetAudioArchiveNotice\('archived'\)/.test(html),false);
  const guards=[slice('function nexaConfirmReset(){','function nexaAddConductTimestamp(){'),
    slice('async function nexaRecoverSavedEncounter(row){','window.nexaRecoverSavedEncounter=nexaRecoverSavedEncounter;'),
    slice('async function logoutNexa(){','const btn=$(\'logoutBtn\')')];
  for(const g of guards)assert.match(g,/NÃO foi arquivado/,'every discard path must warn that audio is not archived');
  assert.match(html,/\$\('recBtn'\)\.onclick=\(\)=>\{[\s\S]{0,500}NÃO foi arquivado/);
});

test('notice helper hides on reset and never accepts an archived state',()=>{
  const els={audioArchiveNotice:el()};
  const fn=new Function('$',noticeSrc+'\nreturn nexaSetAudioArchiveNotice;')(id=>els[id]);
  fn('session_only');assert.equal(els.audioArchiveNotice.hidden,false);
  fn('archived');assert.equal(els.audioArchiveNotice.hidden,true,'unknown/archived state must not render a claim');
  assert.equal(els.audioArchiveNotice.textContent,'');
});

test('discard paths ask first when the retained audio is not archived',async()=>{
  const reset=slice('  function nexaConfirmReset(){','  function nexaAddConductTimestamp(){');
  const run=(answer,transcribed)=>{let confirms=0,msg='';
    const blob=transcribed?{size:9,nexaTranscribed:true}:{size:9};
    const f=new Function('recording','recordingStarting','audioBlob','nexaHasMeaningfulSession','show','confirm',reset+'\nreturn nexaConfirmReset;')
      (false,false,blob,()=>false,()=>{},m=>{confirms++;msg=m;return answer});
    return{allowed:f(),confirms,msg}};
  const ok=run(true,true),no=run(false,true);
  assert.equal(ok.allowed,true);assert.equal(no.allowed,false);
  assert.equal(ok.confirms,1);assert.match(ok.msg,/NÃO foi arquivado/);
  assert.equal(run(true,false).allowed,false,'untranscribed audio is still hard-blocked');
});
