// Provider-reported technical usage only. No transcript, audio, user or encounter data.
const capabilities=new Set(['realtime.radar','realtime.transcription','final.transcription','clinical.documentation','clinical.assistance']);
const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;

export function usageMetric(capability,model,usage){
  if(!capabilities.has(capability)||typeof model!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(model)||!usage||typeof usage!=='object')return null;
  const input_tokens=number(usage.input_tokens),output_tokens=number(usage.output_tokens);
  const cached_tokens=number(usage.input_token_details?.cached_tokens??usage.input_tokens_details?.cached_tokens);
  const seconds=typeof usage.seconds==='number'&&Number.isFinite(usage.seconds)&&usage.seconds>=0&&usage.seconds<=86400
    ?Math.round(usage.seconds*1000)/1000:null;
  if(input_tokens===null&&output_tokens===null&&seconds===null)return null;
  return {event:'nexa_ai_usage_v1',provider:'openai',capability,model,
    ...(input_tokens!==null?{input_tokens}:{}),...(output_tokens!==null?{output_tokens}:{}),
    ...(cached_tokens!==null?{cached_tokens}:{}),...(seconds!==null?{audio_seconds:seconds}:{})};
}

export function emitUsage(capability,model,usage,log=console.info){
  const metric=usageMetric(capability,model,usage);
  if(metric)log(JSON.stringify(metric));
  return metric;
}
