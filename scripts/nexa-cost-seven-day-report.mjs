// Seven contiguous UTC windows, aggregated logs only. NEVER accepts clinical events.
// The monetary result is a partial LIST-PRICE ESTIMATE, not a provider bill.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {analyzeAggregates} from './nexa-cost-aggregate-report.mjs';

const round6=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
const isoUtc=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s.replace('Z','.000Z');

function object(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(k=>!keys.includes(k)))throw new Error('AGGREGATES_ONLY');
}

const TECH_FIELDS=['webrtc_attempt_logs','webrtc_http502_logs','chunk_success_logs','chunk_failed_logs','upstream_status_events'];
function validTechnical(input){
 object(input,TECH_FIELDS);
 for(const field of TECH_FIELDS){
  if(!Object.hasOwn(input,field)||!Number.isSafeInteger(input[field])||
     input[field]<0||input[field]>1e12)throw new Error('INVALID_TECHNICAL_AGGREGATE');
 }
 if(input.webrtc_http502_logs>input.webrtc_attempt_logs)throw new Error('INCONSISTENT_WEBRTC_FAILURES');
 return input;
}

export function analyzeSevenDays(data){
 object(data,['days']);
 if(!Array.isArray(data.days)||data.days.length!==7)throw new Error('REQUIRES_SEVEN_DAYS');
 let prevEnd=null;
 const reports=data.days.map((day,i)=>{
  object(day,['window','usage','http_requests','technical_execution']);
  const technical=day.technical_execution===undefined?null:validTechnical(day.technical_execution);
  if(!day.window || !isoUtc(day.window.start_utc) || !isoUtc(day.window.end_utc))
   throw new Error('UTC_WINDOW_REQUIRED');
  const start=Date.parse(day.window.start_utc),end=Date.parse(day.window.end_utc);
  if(end-start!==86400000)throw new Error('FULL_DAY_WINDOW_REQUIRED');
  if(i>0&&start!==prevEnd)throw new Error('NONCONTIGUOUS_DAYS');
  prevEnd=end;
  return {...analyzeAggregates({window:day.window,usage:day.usage,http_requests:day.http_requests}),
   technical_execution:technical};
 });
 const totals={radar_http_posts:0,radar_http_options:0,realtime_http_posts:0,realtime_http_options:0,
   consultation_http_posts:0,provider_usage_events:0,radar_usage_events:0,
   radar_input_tokens:0,radar_cached_tokens:0,radar_output_tokens:0,
   live_asr_usage_events:0,final_asr_usage_events:0,
   documentation_usage_events:0,assistance_usage_events:0,
   webrtc_attempt_logs:0,webrtc_http502_logs:0,chunk_success_logs:0,
   chunk_failed_logs:0,upstream_status_events:0};
 let partialCost=0,radarCost=0,radarOutputCost=0,observedUsageDays=0,unpriced=false,technicalObservedDays=0;
 const days=[],radarGapDays=[],audioGapDays=[],notComparableDays=[];
 for(const report of reports){
  const date=report.window.start_utc.slice(0,10),http=report.http_requests_by_function_and_method;
  const technical=report.technical_execution;
  if(technical){technicalObservedDays++;for(const field of TECH_FIELDS)totals[field]+=technical[field];}
  const usage=report.usage_by_capability_and_model;
  const count=cap=>usage.filter(row=>row.capability===cap).reduce((n,row)=>n+row.usage_events,0);
  const radarCount=count('realtime.radar'),liveCount=count('realtime.transcription');
  const finalCount=count('final.transcription'),docCount=count('clinical.documentation');
  const assistanceCount=count('clinical.assistance'),usageCount=usage.reduce((n,row)=>n+row.usage_events,0);
  const withUsage=usageCount>0;
  const knownRows=usage.filter(row=>row.estimated_usd!==null);
  const knownCost=round6(knownRows.reduce((n,row)=>n+row.estimated_usd,0));
  const anyUnpriced=usage.some(row=>row.estimated_usd===null);
  const measuredRadar=usage.filter(row=>row.capability==='realtime.radar');
  const radarInput=measuredRadar.reduce((n,row)=>n+row.input_tokens,0);
  const radarCache=measuredRadar.reduce((n,row)=>n+row.cached_tokens,0);
  const radarOutput=measuredRadar.reduce((n,row)=>n+row.output_tokens,0);
  const realtimePosts=http.realtime?.post??0,radarPosts=http.radar?.post??0;
  totals.radar_http_posts+=radarPosts;
  totals.radar_http_options+=http.radar?.options??0;
  totals.realtime_http_posts+=realtimePosts;
  totals.realtime_http_options+=http.realtime?.options??0;
  totals.consultation_http_posts+=http.consultation?.post??0;
  totals.provider_usage_events+=usageCount;totals.radar_usage_events+=radarCount;
  totals.radar_input_tokens+=radarInput;totals.radar_cached_tokens+=radarCache;
  totals.radar_output_tokens+=radarOutput;
  totals.live_asr_usage_events+=liveCount;totals.final_asr_usage_events+=finalCount;
  totals.documentation_usage_events+=docCount;totals.assistance_usage_events+=assistanceCount;
  partialCost+=knownCost;radarCost+=report.radar_observed_token_cost_usd;
  radarOutputCost+=measuredRadar.reduce((n,row)=>n+(row.cost_components?.output_usd??0),0);
  if(withUsage)observedUsageDays++;
  if(anyUnpriced)unpriced=true;
  // POSTs are only transport; never use them as a paid-call denominator.
  if(radarPosts>0 && radarCount===0)radarGapDays.push(date);
  if(realtimePosts>0 && liveCount===0)audioGapDays.push(date);
  if(radarCount>radarPosts)notComparableDays.push(date);
  days.push({
   window_start_utc:report.window.start_utc,
   observed_token_estimate_usd:withUsage&&knownRows.length?knownCost:null,
   no_provider_usage_observed:!withUsage,
   has_unpriced_usage:anyUnpriced,
   radar_http_posts:radarPosts,
   realtime_http_posts:realtimePosts,
   radar_usage_events:radarCount,live_asr_usage_events:liveCount,
   radar_input_tokens:radarInput,radar_cached_tokens:radarCache,radar_output_tokens:radarOutput,
   radar_cached_input_pct:radarInput?Math.round(radarCache/radarInput*10000)/100:null,
   technical_execution:technical,
  });
 }
 return {
  classification:'PARTIAL_PROVIDER_TOKEN_ESTIMATE_NOT_INVOICE',
  first_start_utc:reports[0].window.start_utc,
  last_end_utc:reports[6].window.end_utc,
  days,
  totals,
  days_with_usage_observed:observedUsageDays,
  days_with_technical_execution_aggregates:technicalObservedDays,
  observed_webrtc_http502_pct:totals.webrtc_attempt_logs?
   Math.round(totals.webrtc_http502_logs/totals.webrtc_attempt_logs*10000)/100:null,
  priced_usage_estimate_usd:partialCost>0?round6(partialCost):null,
  priced_radar_usage_estimate_usd:radarCost>0?round6(radarCost):null,
  radar_cached_input_pct:totals.radar_input_tokens?
   Math.round(totals.radar_cached_tokens/totals.radar_input_tokens*10000)/100:null,
  radar_output_cost_share_pct:radarCost?
   Math.round(radarOutputCost/radarCost*10000)/100:null,
  // Scenarios are arithmetic on the observed subset. They are NOT savings.
  hypothetical_10pct_identical_radar_usage_usd:radarCost?round6(radarCost*.1):null,
  hypothetical_10pct_less_radar_output_usd:radarOutputCost?round6(radarOutputCost*.1):null,
  savings_measured_usd:null,billing_reconciled:false,
  coverage:{
   days_with_radar_POST_but_no_usage_event:radarGapDays,
   days_without_technical_execution_aggregates:days.filter(d=>d.technical_execution===null).map(d=>d.window_start_utc.slice(0,10)),
   upstream_status_events_not_observed:totals.webrtc_attempt_logs>0&&totals.upstream_status_events===0,
   http_502_does_not_establish_openai_upstream_status:true,
   days_with_realtime_POST_but_no_live_ASR_usage_event:audioGapDays,
   days_with_radar_usage_events_exceeding_HTTP_POSTs:notComparableDays,
   unknown_billed_WebRTC_audio:true,
   unknown_billing_tier_and_adjustments:true,
   some_usage_models_unpriced:unpriced,
   http_and_provider_usage_not_a_joinable_event_stream:true,
  },
  gates:[
   'RECONCILE_AGGREGATED_PROVIDER_BILLING_BY_DAY_AND_MODALITY',
   'VERIFY_WEBRTC_AUDIO_USAGE_AND_PROVIDER_COST',
   'INVESTIGATE_WEBRTC_NEGOTIATION_WITH_SYNTHETIC_FIXTURES_BEFORE_ANY_RUNTIME_CHANGE',
   'CLINICAL_EQUIVALENCE_REQUIRED_FOR_ANY_SIGNAL_OR_OUTPUT_CHANGE',
   'NO_PAID_API_CALLS_OR_CLINICAL_RUNTIME_CHANGES',
  ]
 };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const raw=readFileSync(0,'utf8');
  if(Buffer.byteLength(raw)>131072)throw new Error('INPUT_TOO_LARGE');
  process.stdout.write(JSON.stringify(analyzeSevenDays(JSON.parse(raw)),null,2)+'\n');
 }catch{
  process.stderr.write('Rejected. Supply exactly seven contiguous UTC days of aggregates only.\n');
  process.exitCode=1;
 }
}
