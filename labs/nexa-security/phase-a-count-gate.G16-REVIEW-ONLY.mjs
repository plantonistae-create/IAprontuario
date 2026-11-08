// G16.4 OFFLINE-ONLY A1 COUNT INTERLOCK. Never runs SQL or network calls.
// Private input stays outside the public repository; CLI errors are sanitized.
// A passing count is NOT authorization for a hosted read or for A2.
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(o,k)=>plain(o)&&Object.keys(o).sort().join('|')===k.slice().sort().join('|');
const stop=reason=>Object.freeze({outcome:'STOP',reason,
 count_within_review_cap:false,authorized_to_run_A2:false,
 authorized_to_read_hosted_SQL:false,allowed_to_publish_private_inventory:false});
export function assessG16PhaseA1Result(envelope){
 if(!exact(envelope,['rows','error','truncated'])||!Array.isArray(envelope.rows)||
  typeof envelope.truncated!=='boolean'||(envelope.error!==null&&typeof envelope.error!=='string'))
  return stop('MALFORMED_OR_UNTRUSTED_ENVELOPE');
 if(envelope.error!==null)return stop('A1_QUERY_ERROR');
 if(envelope.truncated)return stop('A1_TRUNCATED');
 if(envelope.rows.length!==1)return stop('A1_ROW_COUNT_UNEXPECTED');
 const row=envelope.rows[0];
 if(!exact(row,['candidate_public_definer_routines','within_explicit_review_cap'])||
  !Number.isSafeInteger(row.candidate_public_definer_routines)||
  typeof row.within_explicit_review_cap!=='boolean')
  return stop('A1_COUNT_SCHEMA_INVALID');
 const count=row.candidate_public_definer_routines,flag=row.within_explicit_review_cap;
 if(count<0||flag!==(count<=250))return stop('A1_COUNT_CONTRADICTION');
 if(count===0)return stop('A1_UNEXPECTED_ZERO_REQUIRES_REVIEW');
 if(count>250)return stop('A1_OVER_250_STOP');
 return Object.freeze({
  outcome:'A1_COUNT_WITHIN_CAP_REQUIRES_SEPARATE_AUTHORIZATION',
  count_within_review_cap:true,
  aggregate_candidate_count:count,
  authorized_to_run_A2:false,
  authorized_to_read_hosted_SQL:false,
  allowed_to_publish_private_inventory:false,
  next_action:'VERIFY_OPERATOR_PRIVATE_STORAGE_AND_EXPLICIT_AUTH_BEFORE_A2'
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const known=new Set(['G16_LOCAL_PRIVATE_A1_JSON_REQUIRED',
  'G16_PRIVATE_A1_RESULT_MUST_STAY_OUTSIDE_REPOSITORY',
  'G16_A1_RESULT_INVALID_OR_TOO_LARGE','G16_A1_RESULT_INVALID_JSON']);
 try{
  if(process.argv.length!==3)throw Error('G16_LOCAL_PRIVATE_A1_JSON_REQUIRED');
  // Always derive repository root from module location, never process.cwd().
  const root=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
  const file=realpathSync(resolve(process.argv[2]));
  // Canonical paths prevent an external symlink pointing into the repository.
  if(file===root||file.startsWith(root+sep))
   throw Error('G16_PRIVATE_A1_RESULT_MUST_STAY_OUTSIDE_REPOSITORY');
  const stat=statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>4096)
   throw Error('G16_A1_RESULT_INVALID_OR_TOO_LARGE');
  let input;
  try{input=JSON.parse(readFileSync(file,'utf8'));}
  catch{throw Error('G16_A1_RESULT_INVALID_JSON');}
  const verdict=assessG16PhaseA1Result(input);
  // The CLI emits only a screening decision; never the observed private count.
  const {aggregate_candidate_count:_privateCount,...safeVerdict}=verdict;
  process.stdout.write(JSON.stringify(safeVerdict,null,2)+'\n');
  if(verdict.outcome==='STOP')process.exitCode=2;
 }catch(err){
  // In particular, do not echo JSON.parse errors: Node embeds input snippets.
  process.stderr.write((known.has(err?.message)?err.message:'G16_A1_LOCAL_CHECK_FAILED')+'\n');
  process.exitCode=2;
 }
}
