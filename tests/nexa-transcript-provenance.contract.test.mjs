import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTranscriptProvenance } from '../supabase/functions/_shared/nexa-transcript-provenance.mjs';
const item={text:'Paciente relata dor há três dias; nega febre.',provider:'openai',transcriberModel:'synthetic-model',structuringModel:'synthetic-structurer',sourceEventId:'11111111-2222-4333-8444-555555555555'};
test('disabled by default, do not return raw text',()=>assert.equal(buildTranscriptProvenance(item),null));
test('preserve original literal transcription and structuring input when explicitly enabled',()=>{
 const p=buildTranscriptProvenance({...item,enabled:true});
 assert.equal(p.original_final_text,item.text);
 assert.equal(p.structuring_input_text,item.text);
 assert.equal(p.training_eligible,false);
 assert.equal(p.source_kind,'final');
});
test('do not accept oversized, blank or inconsistent provenance',()=>{
 assert.equal(buildTranscriptProvenance({...item,enabled:true,text:' '}),null);
 assert.equal(buildTranscriptProvenance({...item,enabled:true,text:'X'.repeat(400001)}),null);
 assert.equal(buildTranscriptProvenance({...item,enabled:true,sourceEventId:'not-a-uuid'}),null);
});
