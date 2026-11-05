import assert from 'node:assert/strict';
import test from 'node:test';
import {emitUsage,usageMetric} from '../supabase/functions/_shared/nexa-ai-usage.mjs';

test('records provider token counters without clinical content or identifiers',()=>{
 const lines=[];
 const metric=emitUsage('realtime.radar','gpt-5.6-luna',{
  input_tokens:1180,output_tokens:120,input_tokens_details:{cached_tokens:400},
  output_tokens_details:{reasoning_tokens:45,transcript:'never logged'},
  transcript:'Paciente sintético',patient_name:'Pessoa Teste',encounter_id:'private-id'
 },line=>lines.push(line));
 assert.deepEqual(metric,{event:'nexa_ai_usage_v1',provider:'openai',capability:'realtime.radar',model:'gpt-5.6-luna',input_tokens:1180,output_tokens:120,cached_tokens:400,reasoning_tokens:45});
 assert.equal(lines.length,1);
 assert.equal(lines[0].includes('Paciente'),false);
 assert.equal(lines[0].includes('private-id'),false);
 assert.equal(lines[0].includes('never logged'),false);
});

test('supports duration-billed transcription without inventing token counts',()=>{
 assert.deepEqual(usageMetric('final.transcription','gpt-4o-transcribe',{type:'duration',seconds:31.24}),
  {event:'nexa_ai_usage_v1',provider:'openai',capability:'final.transcription',model:'gpt-4o-transcribe',audio_seconds:31.24});
});

test('rejects unbounded, malformed or unapproved telemetry',()=>{
 const lines=[];
 assert.equal(emitUsage('patient-name','model',{input_tokens:1},line=>lines.push(line)),null);
 assert.equal(emitUsage('realtime.radar','model;transcript',{input_tokens:1},line=>lines.push(line)),null);
 assert.equal(emitUsage('realtime.radar','model',{input_tokens:-1,seconds:Infinity},line=>lines.push(line)),null);
 assert.deepEqual(lines,[]);
});

test('logging failure never interrupts the clinical response path',()=>{
 assert.doesNotThrow(()=>emitUsage('realtime.radar','gpt-5.6-luna',{input_tokens:1},()=>{throw new Error('logger unavailable')}));
});

test('does not report invalid, inconsistent or unreturned reasoning counters',()=>{
 const base={input_tokens:10,output_tokens:100};
 for(const value of [-1,101,'25',Infinity,NaN]){
  const metric=usageMetric('realtime.radar','gpt-5.6-luna',{...base,output_tokens_details:{reasoning_tokens:value}});
  assert.equal('reasoning_tokens' in metric,false);
 }
 assert.equal('reasoning_tokens' in usageMetric('realtime.radar','gpt-5.6-luna',base),false);
});
