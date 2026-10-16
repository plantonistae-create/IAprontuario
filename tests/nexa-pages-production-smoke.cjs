'use strict';
/* Public asset verification only. Never touches clinical accounts or patient records. */
const assert=require('node:assert/strict');
const base='https://plantonistae-create.github.io/IAprontuario/';
const files=[
 ['nexa-release-check-20261016.html','NEXA — release clinical-conflicts-20261016'],
 ['nexa-encounter-conflicts-v18.10.2.js','nexaEncounterConflictReview18102'],
 ['nexa-encounter-autosave-v18.10.1.js','async function resolveConflict'],
 ['nexa-hotfix.js','nexa-encounter-conflicts-v18.10.2.js?v=20261016-v1'],
 ['sw.js','20261016-clinical-conflicts'],
 ['index.html','nexa-hotfix.js?v=20261016-clinical-conflicts']
];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verify([file,needle]){
 let last='';
 for(let attempt=1;attempt<=18;attempt++){
  try{
   const response=await fetch(base+file+'?release-check=20261016-'+attempt,{
    redirect:'follow',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(18000)
   });
   const text=await response.text();
   if(response.ok&&text.includes(needle)){
     console.log('PUBLISHED',file,'http',response.status,'attempt',attempt);
     return;
   }
   last='HTTP '+response.status+'; marker '+(text.includes(needle)?'present':'absent');
  }catch(error){last=(error?.name||'FetchError')+': '+String(error?.cause?.code||error?.code||'network unavailable')}
  console.log('WAITING',file,'attempt',attempt,last);
  if(attempt<18)await wait(12000);
 }
 throw new Error('GitHub Pages publication not confirmed for '+file+': '+last);
}
(async()=>{
 for(const check of files)await verify(check);
 assert.equal(files.length,6);
 console.log('NEXA GitHub Pages: six live assets verified; release clinical-conflicts-20261016');
})().catch(error=>{console.error(error);process.exitCode=1});
