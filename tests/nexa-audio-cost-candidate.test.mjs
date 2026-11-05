import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
  LIVE_TRANSCRIBE_MODEL, LIVE_TRANSCRIBE_SERVER_URL,
  selectAudioTranscriptionTransport, buildLiveTranscriptionSessionUpdate,
  createAppendEvent, createCommitEvent, createCompletedTurnCollector,
  compareLiveAudioCost
} from '../experimental/nexa-live-audio-candidate.mjs';

test('candidate fails closed outside local execution, including production flag on',()=>{
  assert.deepEqual(selectAudioTranscriptionTransport(),{mode:'legacy',reason:'CANDIDATE_DISABLED'});
  assert.equal(selectAudioTranscriptionTransport({flag:'on',runtime:'production',speakerLabelsRequired:false}).mode,'legacy');
  assert.equal(selectAudioTranscriptionTransport({flag:'off',runtime:'local',speakerLabelsRequired:false}).mode,'legacy');
  assert.deepEqual(selectAudioTranscriptionTransport({flag:'on',runtime:'local',speakerLabelsRequired:true}),
    {mode:'legacy',reason:'NATIVE_SPEAKER_LABELS_UNAVAILABLE'});
  assert.equal(selectAudioTranscriptionTransport({flag:'on',runtime:'local',speakerLabelsRequired:false}).mode,
    'candidate-protocol-only');
  const index=readFileSync('index.html','utf8');
  const backend=readFileSync('supabase/functions/realtime-call/index.ts','utf8');
  assert.doesNotMatch(index,/nexa-live-audio-candidate|gpt-live-transcribe/);
  assert.doesNotMatch(backend,/nexa-live-audio-candidate|gpt-live-transcribe/);
});

test('dedicated protocol only targets server-side transcription WebSocket, with no conversation response',()=>{
  assert.equal(LIVE_TRANSCRIBE_SERVER_URL,'wss://api.openai.com/v1/realtime?intent=transcription');
  const event=buildLiveTranscriptionSessionUpdate();
  assert.equal(event.session.type,'transcription');
  assert.equal(event.session.audio.input.format.rate,24000);
  assert.equal(event.session.audio.input.format.type,'audio/pcm');
  assert.equal(event.session.audio.input.transcription.model,LIVE_TRANSCRIBE_MODEL);
  assert.deepEqual(event.session.audio.input.transcription.languages,['pt']);
  assert.equal(event.session.audio.input.turn_detection,null);
  assert.equal(event.session.audio.input.transcription.language,undefined);
  assert.equal(event.session.output_modalities,undefined);
  assert.equal(event.session.audio.output,undefined);
  assert.deepEqual(event.session.audio.input.transcription.keywords,['omeprazol','dipirona','Novalgina']);
  assert.deepEqual(createAppendEvent('AAECAw=='),
    {type:'input_audio_buffer.append',audio:'AAECAw=='});
  assert.deepEqual(createCommitEvent(),{type:'input_audio_buffer.commit'});
});

test('rejects malformed audio, unsafe keyword or unsupported delay without network calls',()=>{
  for (const audio of ['', 'not base64', 'AA<==', 'AA==', 'a'.repeat(262148)]) {
    assert.throws(()=>createAppendEvent(audio),/INVALID_AUDIO_PACKET/);
  }
  assert.throws(()=>buildLiveTranscriptionSessionUpdate({keywords:['nome\nsegredo']}),/INVALID_AUDIO_CANDIDATE_KEYWORDS/);
  assert.throws(()=>buildLiveTranscriptionSessionUpdate({keywords:['<script>']}),/INVALID_AUDIO_CANDIDATE_KEYWORDS/);
  assert.throws(()=>buildLiveTranscriptionSessionUpdate({delay:'minimal'}),/INVALID_AUDIO_CANDIDATE_DELAY/);
  assert.throws(()=>buildLiveTranscriptionSessionUpdate({prompt:'a'.repeat(801)}),/INVALID_AUDIO_CANDIDATE_PROMPT/);
});

test('out-of-order completions cannot become patient findings ahead of earlier audio',()=>{
  const buffer=createCompletedTurnCollector();
  assert.equal(buffer.ingest({type:'input_audio_buffer.committed',item_id:'a'}),true);
  assert.equal(buffer.ingest({type:'input_audio_buffer.committed',item_id:'b'}),true);
  assert.equal(buffer.ingest({type:'conversation.item.input_audio_transcription.delta',item_id:'b',delta:'Nao'}),false);
  assert.equal(buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'Nega febre.'}),true);
  assert.deepEqual(buffer.snapshot(),{transcript:'',complete:false,unavailable:false,pending:1});
  assert.equal(buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'Doutor: Teve febre?'}),true);
  assert.deepEqual(buffer.snapshot(),{transcript:'Doutor: Teve febre?\nNega febre.',complete:true,unavailable:false,pending:0});
  assert.equal(buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'OUTRO TEXTO'}),false);
  assert.equal(buffer.snapshot().transcript,'Doutor: Teve febre?\nNega febre.');
  buffer.reset();
  assert.deepEqual(buffer.snapshot(),{transcript:'',complete:true,unavailable:false,pending:0});
});

test('completion preceding its commit is buffered, never mistaken for first utterance',()=>{
 const buffer=createCompletedTurnCollector();
 assert.equal(buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'Nega alergias.'}),true);
 assert.deepEqual(buffer.snapshot(),{transcript:'',complete:false,unavailable:true,pending:0});
 buffer.ingest({type:'input_audio_buffer.committed',item_id:'a'});
 buffer.ingest({type:'input_audio_buffer.committed',item_id:'b'});
 assert.deepEqual(buffer.snapshot(),{transcript:'',complete:false,unavailable:false,pending:1});
 buffer.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'Tem alergias?'});
 assert.deepEqual(buffer.snapshot(),{transcript:'Tem alergias?\\nNega alergias.',complete:true,unavailable:false,pending:0});
});

test('missing or failed audio is explicit, and later speech never erases a gap',()=>{
  const b=createCompletedTurnCollector();
  b.ingest({type:'input_audio_buffer.committed',item_id:'a'});
  b.ingest({type:'input_audio_buffer.committed',item_id:'b'});
  b.ingest({type:'conversation.item.input_audio_transcription.failed',item_id:'a'});
  b.ingest({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'Nao sou alergico.'});
  assert.deepEqual(b.snapshot(),{transcript:'',complete:false,unavailable:true,pending:0});
  b.reset();
  b.ingest({type:'error'});
  assert.equal(b.snapshot().unavailable,true);
});

test('cost estimate does not invent savings or double count shared final transcription',()=>{
  assert.deepEqual(compareLiveAudioCost({minutes:10}),{
    comparable:false,dedicatedCostUsd:0.17,currentCostUsd:null,
    potentialSavingsUsd:null,reason:'CURRENT_AUDIO_USAGE_UNAVAILABLE'
  });
  const usage=compareLiveAudioCost({minutes:10,realtimeAudioInputTokens:50000,
    realtimeAudioCachedInputTokens:0,realtimeAudioOutputTokens:0,
    realtimeTextInputTokens:0,realtimeTextCachedInputTokens:0,realtimeTextOutputTokens:0,
    fallbackTranscriptionMinutes:0});
  assert.equal(compareLiveAudioCost({minutes:10,realtimeAudioInputTokens:50000,
    realtimeAudioCachedInputTokens:0,realtimeAudioOutputTokens:0,
    fallbackTranscriptionMinutes:0}).comparable,false,
    'the Realtime text counters must be known before comparing full sessions');
  assert.equal(usage.comparable,true);
  assert.equal(usage.dedicatedCostUsd,0.17);
  assert.equal(usage.currentCostUsd,0.5);
  assert.equal(usage.potentialSavingsUsd,0.33);
  const cheaperLegacy=compareLiveAudioCost({minutes:10,realtimeAudioInputTokens:1000,
    realtimeAudioCachedInputTokens:0,realtimeAudioOutputTokens:0,
    realtimeTextInputTokens:0,realtimeTextCachedInputTokens:0,realtimeTextOutputTokens:0,
    fallbackTranscriptionMinutes:0});
  assert.ok(cheaperLegacy.potentialSavingsUsd<0,'dedicated audio can be more expensive');
  assert.throws(()=>compareLiveAudioCost({minutes:-1}),/INVALID_AUDIO_DURATION/);
  assert.throws(()=>compareLiveAudioCost({minutes:10,realtimeAudioInputTokens:10,
    realtimeAudioCachedInputTokens:11,realtimeAudioOutputTokens:0,
    realtimeTextInputTokens:0,realtimeTextCachedInputTokens:0,realtimeTextOutputTokens:0,
    fallbackTranscriptionMinutes:0}),/INVALID_AUDIO_USAGE/);
});
