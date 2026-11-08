// Aggregated official-billing *comparison*, never inference of causal savings.
// No API credentials, patient details, raw logs, transcripts, SDP, audio, user
// or encounter identifiers can be accepted by this strict allowlist.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const MODALITIES=new Set(['text','audio','realtime','other']);
const MARKER='OPENAI_OFFICIAL_BILLING_EXPORT_DECLARED';
const utc = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString()===s;
const usd = micros => Math.round(micros)/1e6;
const reject=(code)=>{throw new Error(code);};
function requireObject(input,keys){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(k=>!keys.includes(k)))reject('AGGREGATE_ALLOWLIST_ONLY');
}
function requireInt(n){if(!Number.isSafeInteger(n)||n<0||n>1e9)reject('INVALID_ACTIVITY_COUNT');return n;}
function period(input){
 requireObject(input,['start_utc','end_utc','completed_consultations','billing','complete_billing']);
 if(!utc(input.start_utc)||!utc(input.end_utc))reject('UTC_DAY_BOUNDARIES_REQUIRED');
 const start=Date.parse(input.start_utc),end=Date.parse(input.end_utc),days=(end-start)/86400000;
 if(!Number.isInteger(days)||days<1||days>31)reject('INVALID_PERIOD');
 if(typeof input.complete_billing!=='boolean')reject('BILLING_COVERAGE_REQUIRED');
 const count=requireInt(input.completed_consultations);
 if(!Array.isArray(input.billing)||input.billing.length<1||input.billing.length>40)
    reject('INVALID_AGGREGATE_BILLING_ROWS');
 const seen=new Set();
 let micros=0;
 const rows=input.billing.map(row=>{
   requireObject(row,['model','modality','usd']);
   if(typeof row.model!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(row.model)||
      !MODALITIES.has(row.modality)||typeof row.usd!=='number'||!Number.isFinite(row.usd)||
      row.usd<0||row.usd>100000||Math.abs(row.usd*1e6-Math.round(row.usd*1e6))>0.0001)
      reject('UNVERIFIED_BILLING_ROW');
   const key=row.model+':'+row.modality;
   if(seen.has(key))reject('DUPLICATE_BILLING_SLICE');
   seen.add(key);
   const money=Math.round(row.usd*1e6);
   micros+=money;
   return {model:row.model,modality:row.modality,cost_usd:usd(money)};
 });
 if(!Number.isSafeInteger(micros))reject('BILLING_SUM_OVERFLOW');
 return {start_utc:input.start_utc,end_utc:input.end_utc,days,
   completed_consultations:count,complete_billing:input.complete_billing,
   rows,spend_micros:micros};
}

export function compareOfficialBillingAggregates(data){
 requireObject(data,['source','before','after','controls']);
 if(data.source!==MARKER)reject('OFFICIAL_BILLING_SOURCE_REQUIRED');
 const before=period(data.before),after=period(data.after);
 if(before.days!==after.days||Date.parse(before.end_utc)>Date.parse(after.start_utc))
   reject('NONMATCHED_OR_OVERLAPPING_WINDOWS');
 requireObject(data.controls,['same_billing_project','same_service_tier',
  'same_model_mix','case_mix_matched','audio_billing_complete','no_late_reporting']);
 for(const name of ['same_billing_project','same_service_tier','same_model_mix',
  'case_mix_matched','audio_billing_complete','no_late_reporting'])
   if(typeof data.controls[name]!=='boolean')reject('CONTROL_BOOLEAN_REQUIRED');
 const complete=before.complete_billing&&after.complete_billing;
 const controlsOk=Object.values(data.controls).every(Boolean);
 const moneyBefore=usd(before.spend_micros),moneyAfter=usd(after.spend_micros);
 const delta=usd(after.spend_micros-before.spend_micros);
 const beforePer=before.completed_consultations?before.spend_micros/before.completed_consultations:null;
 const afterPer=after.completed_consultations?after.spend_micros/after.completed_consultations:null;
 const normalized=complete&&controlsOk&&beforePer!==null&&afterPer!==null?
   usd(Math.round((afterPer-beforePer)*100)):null;
 return {
   classification:complete&&controlsOk?
     'DESCRIPTIVE_OFFICIAL_BILLING_AGGREGATES':'COMPARABILITY_BLOCKED',
   source:'OFFICIAL_BILLING_DECLARED_NOT_INDEPENDENTLY_AUTHENTICATED',
   provider_billing_verified_by_connector:false,
   periods_equal_days:before.days===after.days,
   before:{window:[before.start_utc,before.end_utc],days:before.days,
     completed_consultations:before.completed_consultations,
     billing_complete:before.complete_billing,reported_spend_usd:moneyBefore},
   after:{window:[after.start_utc,after.end_utc],days:after.days,
     completed_consultations:after.completed_consultations,
     billing_complete:after.complete_billing,reported_spend_usd:moneyAfter},
   reported_gross_spend_change_usd:complete?delta:null,
   reported_gross_spend_change_pct:complete&&before.spend_micros?
     Math.round((after.spend_micros-before.spend_micros)*10000/before.spend_micros)/100:null,
   change_usd_per_100_completed_consultations:normalized,
   model_modality_slices:{before:before.rows,after:after.rows},
   controls:data.controls,
   savings_attributable_to_nexa_change_usd:null,
   measured_reduction_in_paid_remote_calls:null,
   limitations:[
     'SPEND_CHANGE_IS_NOT_CAUSAL_SAVINGS',
     'CONTRACT_REQUIRES_REVIEW_OF_ACTUAL_OPENAI_BILLING_EXPORT',
     'CONSULTATION_COUNTS_MUST_BE_INDEPENDENTLY_VERIFIED_AS_AGGREGATE',
     ...(!complete?['INCOMPLETE_BILLING_SUPPRESSES_GROSS_SPEND_DELTA']:[]),
     ...(!controlsOk?['CASE_MIX_MODEL_PRICING_OR_AUDIO_CONTROLS_NOT_VERIFIED']:[])
   ]
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const buf=readFileSync(0,'utf8');
  if(Buffer.byteLength(buf)>65536)reject('TOO_LARGE');
  process.stdout.write(JSON.stringify(compareOfficialBillingAggregates(JSON.parse(buf)),null,2)+'\n');
 }catch{
  process.stderr.write('Rejected: strictly aggregated official-billing comparison required.\n');
  process.exitCode=1;
 }
}
