// Offline aggregate cost interpretation. No event IDs, patient or user data, API calls,
// provider pricing assumptions, or claim of observed savings.
export const COST_CATEGORIES=Object.freeze({
 'realtime.radar':'radar',
 'realtime.transcription':'transcription',
 'final.transcription':'transcription',
 'clinical.documentation':'documentation',
 'clinical.assistance':'assistance'
});
const allowedTop=new Set(['schema_version','period','completed_consultations','capabilities','provider_bill_total_usd']);
const allowedRow=new Set(['capability','request_count','declared_cost_usd','latency_histogram']);
const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
const validDecimal=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000000;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
function checkKeys(x,keys){
 if(!plain(x)||Object.keys(x).some(k=>!keys.has(k)))throw Error('AGGREGATE_ONLY_REQUIRED');
}
function quantile(hist,q){
 const total=hist.reduce((sum,b)=>sum+b.count,0);
 if(!total)return null;
 let seen=0;const threshold=Math.ceil(total*q);
 for(const row of hist){seen+=row.count;if(seen>=threshold)return row.upper_ms;}
 return null;
}
export function reconcileAggregateCost(input){
 checkKeys(input,allowedTop);
 if(input.schema_version!=='nexa-cost-aggregate-v1'||
  !plain(input.period)||Object.keys(input.period).sort().join(',')!=='end_utc,start_utc'||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00Z$/.test(input.period.start_utc)||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00Z$/.test(input.period.end_utc)||
  !Number.isFinite(Date.parse(input.period.start_utc))||
  !Number.isFinite(Date.parse(input.period.end_utc))||
  !(Date.parse(input.period.end_utc)>Date.parse(input.period.start_utc))||
  !Number.isSafeInteger(input.completed_consultations)||input.completed_consultations<0||
  input.completed_consultations>10000000||!Array.isArray(input.capabilities)||
  input.capabilities.length>32||!input.capabilities.length)
  throw Error('AGGREGATE_CONTRACT_INVALID');
 const byCategory={},used=new Set();let declared=0,requests=0;
 for(const row of input.capabilities){
  checkKeys(row,allowedRow);
  if(!Object.hasOwn(COST_CATEGORIES,row.capability)||used.has(row.capability)||
     !Number.isSafeInteger(row.request_count)||row.request_count<0||
     row.request_count>1e9||
     !(row.declared_cost_usd===null||validDecimal(row.declared_cost_usd)))
    throw Error('AGGREGATE_CAPABILITY_INVALID');
  used.add(row.capability);
  const cat=COST_CATEGORIES[row.capability],out=byCategory[cat]??={requests:0,declared_cost_usd:0,cost_coverage_complete:true,capability_count:0,histograms:[]};
  out.capability_count++;out.requests+=row.request_count;requests+=row.request_count;
  if(!Number.isSafeInteger(out.requests)||!Number.isSafeInteger(requests))throw Error('AGGREGATE_COUNT_OVERFLOW');
  if(row.declared_cost_usd===null)out.cost_coverage_complete=false;
  else {out.declared_cost_usd+=row.declared_cost_usd;declared+=row.declared_cost_usd;}
  const hist=row.latency_histogram;
  if(hist!==undefined){
   if(!Array.isArray(hist)||hist.length>25||hist.length<1)throw Error('AGGREGATE_HISTOGRAM_INVALID');
   let prev=-1,total=0;
   for(const b of hist){
    if(!plain(b)||Object.keys(b).sort().join(',')!=='count,upper_ms'||
       !Number.isSafeInteger(b.count)||b.count<0||
       !Number.isSafeInteger(b.upper_ms)||b.upper_ms<0||b.upper_ms<=prev)
      throw Error('AGGREGATE_HISTOGRAM_INVALID');
    total+=b.count;prev=b.upper_ms;
    if(!Number.isSafeInteger(total))throw Error('AGGREGATE_HISTOGRAM_INVALID');
   }
   if(total!==row.request_count)throw Error('AGGREGATE_HISTOGRAM_COUNT_MISMATCH');
   // Category quantiles require complete aggregate histograms from every modality.
   out.histograms.push(hist);
  }
 }
 const bill=input.provider_bill_total_usd;
 if(!(bill===undefined||bill===null||validDecimal(bill)))throw Error('AGGREGATE_BILL_INVALID');
 const covered=Object.values(byCategory).every(c=>c.cost_coverage_complete);
 const remaining=bill===undefined||bill===null||!covered?null:round(bill-declared);
 const tolerance=.00001;
 const reconciled=bill!==undefined&&bill!==null&&covered&&Math.abs(remaining)<=tolerance;
 const perConsultation=input.completed_consultations&&covered?round(declared/input.completed_consultations):null;
 return Object.freeze({
  schema_version:'nexa-cost-aggregate-report-v1',
  counts:{requests,completed_consultations:input.completed_consultations},
  categories:Object.fromEntries(Object.entries(byCategory).map(([k,v])=>
   [k,(()=>{
    const complete=v.histograms.length===v.capability_count;
    const counts=new Map();
    if(complete)for(const hist of v.histograms)for(const row of hist)
      counts.set(row.upper_ms,(counts.get(row.upper_ms)||0)+row.count);
    const combined=[...counts].sort((a,b)=>a[0]-b[0]).map(([upper_ms,count])=>({upper_ms,count}));
    return {requests:v.requests,
     declared_cost_usd:v.cost_coverage_complete?round(v.declared_cost_usd):null,
     latency_p50_ms:complete?quantile(combined,.50):null,
     latency_p95_ms:complete?quantile(combined,.95):null};
   })()])),
  declared_observational_total_usd:covered?round(declared):null,
  declared_cost_per_completed_consultation_usd:perConsultation,
  provider_bill_difference_usd:remaining,
  totals_match_declared_invoice:reconciled,
  official_billing_verified_by_connector:false,
  complete_capability_coverage:false,
  causal_savings_attributable_to_nexa_usd:null,
  reconciliation_status:reconciled?'DECLARED_TOTAL_MATCH_NOT_VERIFIED':'NOT_RECONCILED'
 });
}
