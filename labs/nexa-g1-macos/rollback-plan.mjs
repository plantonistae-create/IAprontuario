// PLAN ONLY. Never starts, stops, deletes or alters services.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function rollbackPlan(){
 return Object.freeze({
  mode:'PLAN_ONLY',root:resolve(fileURLToPath(new URL('.',import.meta.url))),
  project:'nexa_g1_macos_local_only',network:'nexa-g1-macos-20261107',
  steps:[
   'Stop any future browser sessions first; confirm only synthetic data exists',
   'After a SEPARATE authorization: run supabase stop from this lab folder, without --no-backup',
   'Inspect dedicated network owner label and connected containers before removing network',
   'Preserve local data pending explicit cleanup approval; NEVER run docker system prune',
   'Never use supabase link, remote migrations, or hosted rollback commands'
  ],
  executed:false,deleted:false,productionChanged:false,authorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--plan')throw Error('ONLY_PLAN_SUPPORTED');
 console.log(JSON.stringify(rollbackPlan(),null,2));
}
