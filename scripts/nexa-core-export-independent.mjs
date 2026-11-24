#!/usr/bin/env node
/**
 * NEXA Core G0 offline synthetic dataset exporter.
 * Usage: node scripts/nexa-core-export-independent.mjs <cases.json> <output-dir> <dataset-version>
 * Put synthetic audio in <cases.json directory>/audio/<referenced-file>.
 * Never reads Supabase, patient histories, audio devices or API output.
 */
import { readFile, mkdir, writeFile, rm, lstat, copyFile, realpath } from 'node:fs/promises';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildIndependentSyntheticBundle } from '../experimental/nexa-core-capture-export.G0-NOT-DEPLOYED.mjs';

async function verifySyntheticAudio(inputFile, cases){
  const root=resolve(dirname(inputFile),'audio');
  const files=new Map();
  for(const item of cases){
    const audio=item.audio;
    if(!audio)continue;
    const name=audio.ref.slice('lab://audio/'.length);
    const target=resolve(root,name);
    if(relative(root,target).startsWith('..'+sep) || relative(root,target)==='..' || target===root)
      throw Error('AUDIO_PATH_OUTSIDE_LAB');
    const info=await lstat(target);
    if(!info.isFile()||info.isSymbolicLink()||info.size===0||info.size>250*1024*1024)
      throw Error('INVALID_SYNTHETIC_AUDIO_FILE');
    const realRoot=await realpath(root),realTarget=await realpath(target);
    if(!realTarget.startsWith(realRoot+sep))throw Error('AUDIO_REALPATH_OUTSIDE_LAB');
    const bytes=await readFile(target);
    const actual='sha256:'+createHash('sha256').update(bytes).digest('hex');
    if(actual.toLowerCase()!==audio.sha256.toLowerCase())
      throw Error('SYNTHETIC_AUDIO_DIGEST_MISMATCH');
    const existing=files.get(name);
    if(existing&&existing.sha256!==actual)throw Error('SYNTHETIC_AUDIO_REFERENCE_CONFLICT');
    files.set(name,{name,path:target,sha256:actual,size:info.size});
  }
  return [...files.values()];
}
export async function exportSyntheticDataset({inputFile,outputDir,datasetVersion}){
  if(!inputFile||!outputDir||!datasetVersion)throw Error('USAGE_SYNTHETIC_INPUT_OUTPUT_VERSION_REQUIRED');
  const absoluteInput=resolve(inputFile);
  const cases=JSON.parse(await readFile(absoluteInput,'utf8'));
  // All business/rights/data-shape validation finishes before filesystem writes.
  const bundle=buildIndependentSyntheticBundle(cases,{datasetVersion});
  const audioFiles=await verifySyntheticAudio(absoluteInput,cases);
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
    audio_assets:audioFiles.map(a=>({ref:'lab://audio/'+a.name,sha256:a.sha256,size:a.size})),
    real_clinical_training_allowed:false,
    clinical_release_allowed:false
  };
  const entries=[
    ...Object.entries(files).map(([k,v])=>[k+'.jsonl',v]),
    ['manifest.json',JSON.stringify(manifest,null,2)+'\n']
  ];
  await mkdir(destination,{recursive:true,mode:0o700});
  const written=[];
  try{
    for(const [name,data] of entries){
      const path=join(destination,name);
      await writeFile(path,data,{encoding:'utf8',flag:'wx',mode:0o600});
      written.push(path);
    }
    if(audioFiles.length){
      const audioDir=join(destination,'audio');
      await mkdir(audioDir,{mode:0o700});
      for(const audio of audioFiles){
        const path=join(audioDir,audio.name);
        await copyFile(audio.path,path,1 /* COPYFILE_EXCL */);
        written.push(path);
      }
    }
  }catch(e){
    // Roll back only the files we created, never overwrite user data.
    await Promise.all(written.map(path=>rm(path,{force:true})));
    throw e;
  }
  return Object.freeze({destination,manifest});
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [inputFile,outputDir,datasetVersion]=process.argv.slice(2);
  exportSyntheticDataset({inputFile,outputDir,datasetVersion})
    .then(({destination,manifest})=>console.log(JSON.stringify({
      status:'SYNTHETIC_DATASET_EXPORTED',directory:destination,
      cases:manifest.case_count,counts:manifest.counts,audio_files:manifest.audio_assets.length
    })))
    .catch(error=>{
      console.error('NEXA_CORE_G0_EXPORT_FAILED:',String(error?.message||'UNKNOWN_ERROR'));
      process.exitCode=1;
    });
}
