#!/usr/bin/env node
/**
 * NEXA Core G0 offline synthetic dataset exporter.
 * Usage: node scripts/nexa-core-export-independent.mjs <cases.json> <output-dir> <dataset-version>
 * Never reads Supabase, patient histories, audio devices or API output.
 */
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildIndependentSyntheticBundle } from '../experimental/nexa-core-capture-export.G0-NOT-DEPLOYED.mjs';

export async function exportSyntheticDataset({inputFile,outputDir,datasetVersion}){
  if(!inputFile||!outputDir||!datasetVersion)throw Error('USAGE_SYNTHETIC_INPUT_OUTPUT_VERSION_REQUIRED');
  const cases=JSON.parse(await readFile(resolve(inputFile),'utf8'));
  const bundle=buildIndependentSyntheticBundle(cases,{datasetVersion});
  const destination=resolve(outputDir);
  const files={
    asr:bundle.files.asr_jsonl,
    radar:bundle.files.radar_jsonl,
    documentation:bundle.files.documentation_jsonl
  };
  const hashes=Object.fromEntries(Object.entries(files).map(([k,v])=>[
    k,createHash('sha256').update(v,'utf8').digest('hex')
  ]));
  const manifest={
    schema_version:bundle.schema_version,
    dataset_version:bundle.dataset_version,
    origin:'independent_synthetic_lab',
    case_count:bundle.case_count,
    counts:bundle.counts,
    splits:bundle.partitions,
    sha256:hashes,
    real_clinical_training_allowed:false,
    clinical_release_allowed:false,
    audio_assets_must_be_validated_separately:true
  };
  const entries=[
    ...Object.entries(files).map(([k,v])=>[k+'.jsonl',v]),
    ['manifest.json',JSON.stringify(manifest,null,2)+'\n']
  ];
  // Prepare/validate the entire dataset BEFORE creating any outputs.
  await mkdir(destination,{recursive:true,mode:0o700});
  const written=[];
  try{
    for(const [name,data] of entries){
      const path=join(destination,name);
      await writeFile(path,data,{encoding:'utf8',flag:'wx',mode:0o600});
      written.push(path);
    }
  }catch(e){
    // Roll back ONLY files this invocation created; never overwrite existing files.
    await Promise.all(written.map(path=>rm(path,{force:true})));
    throw e;
  }
  return Object.freeze({destination,manifest});
}

if(process.argv[1] && import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
  const [inputFile,outputDir,datasetVersion]=process.argv.slice(2);
  exportSyntheticDataset({inputFile,outputDir,datasetVersion})
    .then(({destination,manifest})=>console.log(JSON.stringify({
      status:'SYNTHETIC_DATASET_EXPORTED',directory:destination,
      cases:manifest.case_count,counts:manifest.counts
    })))
    .catch(error=>{
      console.error('NEXA_CORE_G0_EXPORT_FAILED:',String(error?.message||'UNKNOWN_ERROR'));
      process.exitCode=1;
    });
}
