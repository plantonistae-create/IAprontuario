// G16.3 OFFLINE-ONLY A1 COUNT INTERLOCK, no SQL/network execution.
// Private input remains OUTSIDE the public repo. Never copies raw data into output.
// PASS of this program is a COUNT CHECK only, NOT hosted SQL authorization.
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
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
 const filepath=process.argv[2];
 if(!filepath)throw Error('G16_LOCAL_PRIVATE_A1_JSON_REQUIRED');
 const file=resolve(filepath), root=resolve(process.cwd());
 if(file===root||file.startsWith(root+sep))
  throw Error('G16_PRIVATE_A1_RESULT_MUST_STAY_OUTSIDE_REPOSITORY');
 const obj=JSON.parse(readFileSync(file,'utf8'));
 const verdict=assessG16PhaseA1Result(obj);
 process.stdout.write(JSON.stringify(verdict,null,2)+'\n');
 if(verdict.outcome==='STOP')process.exitCode=2;
}
