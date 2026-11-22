import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { exportSyntheticDataset } from '../scripts/nexa-core-export-independent.mjs';

function fixture(){
  return [{case_id:'cenario_hipotetico_01',origin:'synthetic_original',
    provenance:{original_human_authored:true,no_real_patient_data:true,
      no_provider_output_labels:true,reviewed_by_clinician:true,rights_confirmed:true},
    audio:null,reference_transcript:'Consulta inteiramente fictícia para testes.',
    clinical_context:'Pessoa fictícia sem identificação, tosse leve.',
    radar_questions:[{concept_id:'dispneia',question:'Houve falta de ar?'}],
    reference_documentation:'Consulta fictícia. Sem sinais de gravidade.'}];
}
test('offline exporter writes JSONL and a verifiable SHA-256 manifest',async()=>{
  const root=await mkdtemp(join(tmpdir(),'nexa-g0-'));
  try{
    const input=join(root,'source.json'),output=join(root,'out');
    await writeFile(input,JSON.stringify(fixture()));
    const {manifest}=await exportSyntheticDataset({inputFile:input,outputDir:output,datasetVersion:'lab-v1'});
    assert.equal(manifest.case_count,1);
    assert.equal(manifest.counts.asr,0);
    assert.equal(manifest.real_clinical_training_allowed,false);
    for(const key of ['asr','radar','documentation']){
      const data=await readFile(join(output,key+'.jsonl'),'utf8');
      assert.equal(createHash('sha256').update(data).digest('hex'),manifest.sha256[key]);
    }
    assert.equal(JSON.parse((await readFile(join(output,'radar.jsonl'),'utf8')).trim()).task,'radar');
  }finally{await rm(root,{recursive:true,force:true})}
});
test('export never overwrites an existing output',async()=>{
  const root=await mkdtemp(join(tmpdir(),'nexa-g0-'));
  try{
    const input=join(root,'source.json'),output=join(root,'out');
    await writeFile(input,JSON.stringify(fixture()));
    await exportSyntheticDataset({inputFile:input,outputDir:output,datasetVersion:'lab-v1'});
    await assert.rejects(exportSyntheticDataset({inputFile:input,outputDir:output,datasetVersion:'lab-v1'}),{code:'EEXIST'});
    assert.equal(JSON.parse((await readFile(join(output,'manifest.json'),'utf8')).trim()).case_count,1);
  }finally{await rm(root,{recursive:true,force:true})}
});
test('clinical records are refused before creating an export directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'nexa-g0-'));
  try{
    const input=join(root,'source.json'),output=join(root,'out');
    const rows=fixture();rows[0].origin='real_clinical';
    await writeFile(input,JSON.stringify(rows));
    await assert.rejects(exportSyntheticDataset({inputFile:input,outputDir:output,datasetVersion:'lab-v1'}),/REAL_CLINICAL_TRAINING_EXPORT_BLOCKED/);
    await assert.rejects(readFile(join(output,'manifest.json'),'utf8'),{code:'ENOENT'});
  }finally{await rm(root,{recursive:true,force:true})}
});

test('synthetic audio is copied only when its independent asset digest matches',async()=>{
  const root=await mkdtemp(join(tmpdir(),'nexa-g0-'));
  try{
    const input=join(root,'source.json'),output=join(root,'out');
    const audio=Buffer.from('RIFF0000WAVEfmt 0000data0000SYNTHETIC_SILENCE');
    const cases=fixture();
    cases[0].audio={
      ref:'lab://audio/fictional.wav',mime:'audio/wav',
      sha256:'sha256:'+createHash('sha256').update(audio).digest('hex'),
      duration_ms:1000
    };
    await mkdir(join(root,'audio'));
    await writeFile(join(root,'audio','fictional.wav'),audio);
    await writeFile(input,JSON.stringify(cases));
    const {manifest}=await exportSyntheticDataset({inputFile:input,outputDir:output,datasetVersion:'lab-v1'});
    assert.equal(manifest.counts.asr,1);
    assert.equal(manifest.audio_assets.length,1);
    assert.deepEqual(await readFile(join(output,'audio','fictional.wav')),audio);
  }finally{await rm(root,{recursive:true,force:true})}
});
test('tampered synthetic audio prevents all dataset writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'nexa-g0-'));
  try{
    const input=join(root,'source.json'),output=join(root,'out');
    const cases=fixture();
    cases[0].audio={ref:'lab://audio/fictional.wav',mime:'audio/wav',
      sha256:'sha256:'+'0'.repeat(64),duration_ms:1000};
    await mkdir(join(root,'audio'));
    await writeFile(join(root,'audio','fictional.wav'),'WRONG_AUDIO_BYTES');
    await writeFile(input,JSON.stringify(cases));
    await assert.rejects(exportSyntheticDataset({inputFile:input,outputDir:output,datasetVersion:'lab-v1'}),/SYNTHETIC_AUDIO_DIGEST_MISMATCH/);
    await assert.rejects(readFile(join(output,'manifest.json'),'utf8'),{code:'ENOENT'});
  }finally{await rm(root,{recursive:true,force:true})}
});
