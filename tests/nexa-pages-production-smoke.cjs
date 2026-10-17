'use strict';
/* Public asset verification only. Never touches clinical accounts or patient records. */
const assert=require('node:assert/strict');
const base='https://plantonistae-create.github.io/IAprontuario/';
const targetDate=process.env.GITHUB_EVENT_NAME==='pull_request'?'20261016':'20261017';
const releaseName=targetDate==='20261016'?'clinical-conflicts-20261016':'notice-defer-20261017';
const loaderTag=targetDate==='20261016'?'20261016-v1':'20261017-deferral';
const hotfixTag=targetDate==='20261016'?'20261016-clinical-conflicts':'20261017-notice-defer';
const files=[
 ['nexa-release-check-'+targetDate+'.html','NEXA — release '+releaseName],
 ['nexa-encounter-conflicts-v18.10.2.js','nexaEncounterConflictReview18102'],
 ['nexa-encounter-autosave-v18.10.1.js','async function resolveConflict'],
 ['nexa-hotfix.js','nexa-encounter-conflicts-v18.10.2.js?v='+loaderTag],
 ['sw.js',hotfixTag],
 ['index.html','nexa-hotfix.js?v='+hotfixTag]
];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verify([file,needle]){
 let last='';
 for(let attempt=1;attempt<=18;attempt++){
  try{
   const response=await fetch(base+file+'?release-check='+targetDate+'-'+attempt,{
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
 console.log('NEXA GitHub Pages: six live assets verified; release '+releaseName);
})().catch(error=>{console.error(error);process.exitCode=1});
