// Offline/read-only cost reconciliation from strictly aggregate provider counters.
// No API keys, transcript, audio, encounter/user IDs or raw log events are accepted.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const PRICE_BASIS = '2026-11-05 official OpenAI API list prices, Standard tier, USD per 1M tokens';
export const PRICES = Object.freeze({
 'gpt-5.6-luna': {input:0.20,cached:0.02,output:1.20},
 'gpt-5.6-terra': {input:2.00,cached:0.20,output:12.00},
 'gpt-4o-transcribe': {input:2.50,cached:null,output:10.00},
 'gpt-4o-mini-transcribe': {input:1.25,cached:null,output:5.00},
});
const CAPABILITIES = new Set([
 'realtime.radar','realtime.transcription','final.transcription',
 'clinical.documentation','clinical.assistance'
]);
const HTTP_FUNCTIONS = new Set(['radar','realtime','consultation','other']);
const USD = n => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const validInt = n => typeof n === 'number' && Number.isSafeInteger(n) && n>=0 && n<=1e12;
function object(value, allowed) {
 if(!value || typeof value!=='object' || Array.isArray(value) ||
    Object.keys(value).some(key => !allowed.includes(key))) throw new Error('AGGREGATES_ONLY');
}
function count(value) {
 if(!validInt(value)) throw new Error('INVALID_COUNT');
 return value;
}
function summarizeRow(row) {
 object(row,['capability','model','events','input_tokens','cached_tokens','output_tokens','reasoning_tokens','audio_seconds']);
 if(!CAPABILITIES.has(row.capability) || typeof row.model!=='string' ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(row.model)) throw new Error('UNAPPROVED_CAPABILITY');
 const events=count(row.events), input=count(row.input_tokens), cached=count(row.cached_tokens),
  output=count(row.output_tokens), reasoning=count(row.reasoning_tokens ?? 0);
 const seconds=row.audio_seconds ?? 0;
 if(typeof seconds!=='number' || !Number.isFinite(seconds) || seconds<0 || seconds>86400*10000 ||
    cached>input || reasoning>output) throw new Error('INCONSISTENT_COUNTERS');
 const rates=PRICES[row.model], unpriced=!rates || (cached>0 && rates.cached===null);
 const cost=unpriced ? null : {
  uncached_input_usd: USD((input-cached)*rates.input/1e6),
  cached_input_usd: USD(cached*rates.cached/1e6),
  output_usd: USD(output*rates.output/1e6)
 };
 const estimated=cost ? USD(cost.uncached_input_usd+cost.cached_input_usd+cost.output_usd) : null;
 return {capability:row.capability,model:row.model,usage_events:events,input_tokens:input,
  cached_tokens:cached,output_tokens:output,reasoning_tokens:reasoning,audio_seconds_reported:seconds,
  cached_input_ratio:input?Math.round(cached/input*10000)/100:null,
  cost_components:cost,estimated_usd:estimated,
  note:unpriced?'NO_VERIFIED_PRICE':(seconds>0?'TOKEN_PRICE_ONLY_DO_NOT_DOUBLE_BILL_AUDIO':'TOKEN_PRICE_ONLY')};
}
export function analyzeAggregates(data) {
 object(data,['window','usage','http_requests']);
 object(data.window,['start_utc','end_utc']);
 const start=Date.parse(data.window.start_utc),end=Date.parse(data.window.end_utc);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(data.window.start_utc) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(data.window.end_utc)) throw new Error('INVALID_WINDOW');
 if(!Array.isArray(data.usage)||data.usage.length>30)throw new Error('INVALID_AGGREGATE_ROWS');
 const rows=data.usage.map(summarizeRow);
 object(data.http_requests, [...HTTP_FUNCTIONS]);
 const http={};
 for(const [name,counts] of Object.entries(data.http_requests)) {
  object(counts,['post','options']);
  http[name]={post:count(counts.post),options:count(counts.options)};
 }
 const priced=rows.filter(row=>row.estimated_usd!==null);
 const estimatedTotal=USD(priced.reduce((sum,row)=>sum+row.estimated_usd,0));
 const radar=priced.filter(row=>row.capability==='realtime.radar');
 const radarTotal=USD(radar.reduce((sum,row)=>sum+row.estimated_usd,0));
 const radarOutput=USD(radar.reduce((sum,row)=>sum+row.cost_components.output_usd,0));
 return {
  classification:'ESTIMATE_NOT_INVOICE',price_basis:PRICE_BASIS,
  window:data.window, http_requests_by_function_and_method:http,
  usage_by_capability_and_model:rows,
  estimated_observed_token_cost_usd:estimatedTotal,
  radar_observed_token_cost_usd:radarTotal,
  radar_output_cost_share_pct:radarTotal?Math.round(radarOutput/radarTotal*10000)/100:null,
  hypothetical_10pct_fewer_identical_radar_token_usage_usd:USD(radarTotal*0.1),
  hypothetical_10pct_less_radar_output_usd:USD(radarOutput*0.1),
  measured_savings_usd:null,
  billing_reconciled:false,
  missing: [
   ...(http.realtime?.post>0 ? ['REALTIME_WEBRTC_AUDIO_USAGE_AND_BILLING_NOT_OBSERVABLE'] : []),
   ...(rows.some(r=>r.estimated_usd===null)?['SOME_MODELS_UNPRICED']:[]),
   'PROVIDER_BILLING_AND_SERVICE_TIER_NOT_RECONCILED',
   'HTTP_POST_IS_NOT_A_BILLED_MODEL_CALL',
   'NO_BEFORE_AFTER_COST_CONTROL'
  ]
 };
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
 try {
  // Accept ONLY pre-aggregated JSON piped from a controlled source.
  const raw=readFileSync(0,'utf8');
  if(Buffer.byteLength(raw)>131072)throw new Error('INPUT_TOO_LARGE');
  process.stdout.write(JSON.stringify(analyzeAggregates(JSON.parse(raw)),null,2)+'\n');
 } catch {
  // Intentionally do not echo input or parse exceptions that could include sensitive content.
  process.stderr.write('Rejected: aggregate-only input required. No raw logs or patient fields.\n');
  process.exitCode=1;
 }
}
