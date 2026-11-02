/** Real-provider ASR benchmark using synthetic WAV only; never prints transcripts. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const key=process.env.OPENAI_API_KEY;
if(!key)throw new Error('ASR_BENCHMARK_BLOCKED: OPENAI_API_KEY is unavailable in this test environment');
const model=process.env.NEXA_ASR_BENCHMARK_MODEL||'gpt-4o-transcribe';
if(!/^gpt-(?:4o(?:-mini)?-transcribe|transcribe)$/.test(model))throw new Error('ASR_BENCHMARK_BLOCKED: unsupported benchmark model');
const audioDir=process.env.NEXA_AUDIO_FIXTURE_DIR||'/private/tmp/nexa-medication-audio';
const reportPath=process.env.NEXA_ASR_BENCHMARK_REPORT||'/private/tmp/nexa-medication-asr-benchmark.json';
const corpus=JSON.parse(await readFile(path.join(root,'tests/medication-audio-corpus.json'),'utf8'));
const prompt='Consulta médica em português brasileiro. Nomes possíveis: omeprazol, Novalgina, dipirona, Celestrat, metformina, losartana. Preserve literalmente o nome referido, números, unidades e negações; não substitua nomes por princípios ativos.';
const numberWords={um:'1',uma:'1',dois:'2',duas:'2',tres:'3',quatro:'4',cinco:'5',oito:'8',vinte:'20'};
function normalize(value){
 let s=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 s=s.replace(/\b(um|uma|dois|duas|tres|quatro|cinco|oito|vinte)\b/g,w=>numberWords[w]);
 s=s.replace(/\bmililitros?\b/g,'ml').replace(/\bmiligramas?\b/g,'mg')
   .replace(/\bgotas?\b/g,'gota').replace(/\bcomprimidos?\b/g,'comprimido')
   .replace(/\bde\s+(\d+)\s+em\s+\1\s+horas?\b/g,'$1/$1 horas')
   .replace(/\bmg\s*\/\s*ml\b/g,'mg por ml');
 return s.replace(/[^a-z0-9/]+/g,' ').trim().replace(/\s+/g,' ');
}
const contains=(text,term)=>` ${text} `.includes(` ${normalize(term)} `);
function wordErrors(reference,actual){
 const a=normalize(reference).split(' '),b=normalize(actual).split(' ');
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const next=[i];for(let j=1;j<=b.length;j++)
   next[j]=Math.min(prev[j]+1,next[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
  prev=next;
 }
 return {errors:prev[b.length],reference_words:a.length};
}
async function transcribe(scenario,variant){
 const bytes=await readFile(path.join(audioDir,scenario.id+'.wav'));
 if(bytes.length<5000||bytes.toString('ascii',0,4)!=='RIFF')throw new Error(`Invalid synthetic WAV: ${scenario.id}`);
 const form=new FormData();
 form.append('file',new Blob([bytes],{type:'audio/wav'}),scenario.id+'.wav');
 form.append('model',model);form.append('language','pt');
 if(variant==='context')form.append('prompt',prompt);
 const started=performance.now();
 const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
  method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(60000)
 });
 const latency_ms=Math.round(performance.now()-started);
 if(!response.ok)throw new Error(`ASR request failed for ${scenario.id}/${variant}: HTTP ${response.status}`);
 const result=await response.json();
 if(typeof result.text!=='string')throw new Error(`ASR response missing text for ${scenario.id}/${variant}`);
 const text=normalize(result.text),rubric=scenario.asr||{};
 const misses={},hits={};
 for(const category of ['name','number_unit','timing','negation','attribution']){
  const terms=rubric[category]||[];misses[category]=terms.filter(term=>!contains(text,term)).length;
  hits[category]=terms.length-misses[category];
 }
 const forbidden_hits=(rubric.forbidden||[]).filter(term=>contains(text,term)).length;
 const wer=wordErrors(scenario.text,result.text);
 return {id:scenario.id,variant,latency_ms,hits,misses,forbidden_hits,...wer,
  usage:result.usage&&typeof result.usage==='object'?{
   input_tokens:Number.isFinite(result.usage.input_tokens)?result.usage.input_tokens:null,
   output_tokens:Number.isFinite(result.usage.output_tokens)?result.usage.output_tokens:null,
   seconds:Number.isFinite(result.usage.seconds)?result.usage.seconds:null
  }:null};
}
const rows=[];
for(const scenario of corpus){
 for(const variant of ['baseline','context'])rows.push(await transcribe(scenario,variant));
}
const aggregate=variant=>{
 const selected=rows.filter(row=>row.variant===variant),categories=['name','number_unit','timing','negation','attribution'];
 return {calls:selected.length,latency_ms_mean:Math.round(selected.reduce((n,r)=>n+r.latency_ms,0)/selected.length),
  word_error_rate_proxy:Number((selected.reduce((n,r)=>n+r.errors,0)/selected.reduce((n,r)=>n+r.reference_words,0)).toFixed(3)),
  forbidden_hits:selected.reduce((n,r)=>n+r.forbidden_hits,0),
  categories:Object.fromEntries(categories.map(c=>[c,{found:selected.reduce((n,r)=>n+r.hits[c],0),
   missed:selected.reduce((n,r)=>n+r.misses[c],0)}]))};
};
const report={generated_at:new Date().toISOString(),model,corpus_size:corpus.length,
 note:'Synthetic speech; no patient recordings. Approximate word error rate is not clinical sign-off. No raw transcripts retained.',
 baseline:aggregate('baseline'),context:aggregate('context'),cases:rows};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({report:reportPath,model,baseline:report.baseline,context:report.context}));
