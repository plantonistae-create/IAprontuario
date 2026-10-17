// Executable CPU-only NEXA Core Radar baseline.
// No OpenAI, Google, remote AI, GPU, network or database dependency.
// NOT a clinically validated language model; use as a reference implementation.
import Engine from "../../nexa-radar-engine.js";
import {RADAR_API_CONTRACT} from "../../supabase/functions/_shared/nexa-core-radar-adapter.mjs";

const categories=new Set(["history","red_flags","exam","vitals","risk","medications","differential"]);
const sections=new Set(["transcript","queixa_principal","hda","alergias","comorbidades","medicacoes","antecedentes","exame_fisico","sinais_vitais"]);
const priorities=new Set(["critical","high","moderate","low"]);
const states=new Set(["known_present","known_absent","unknown"]);
const temporal=new Set(["current","recent","prior","resolved"]);

function sourceFor(context,section){
  return String(section==="transcript"?context.transcript:context.fields?.[section]||"");
}
function snippet(context,quote,section) {
  return typeof quote==="string" && quote.length>=5 && quote.length<=500 &&
    sections.has(section) && sourceFor(context,section).includes(quote) && !quote.includes("?")
    ?quote:null;
}
function fallbackEvidence(context,state) {
  for(const f of Object.values(state.facts||{})) {
    if(f?.state!=="known_present")continue;
    for(const e of f.evidence||[]) {
      const text=snippet(context,e?.quote,e?.section);
      if(text)return text;
    }
  }
  for(const section of ["hda","queixa_principal","transcript"]){
    const source=sourceFor(context,section);
    if(source.length>=5)return source.slice(0,Math.min(400,source.length));
  }
  return null;
}

export function inferRadarLocally(payload){
  if(payload?.schema_version!==RADAR_API_CONTRACT ||
     payload?.capability!=="realtime.radar" ||
     !Array.isArray(payload?.allowed_concepts) ||
     !payload?.context || typeof payload.context!=="object") {
    throw new Error("RADAR_BASELINE_INVALID_REQUEST");
  }
  const context={
    transcript:String(payload.context.transcript||"").slice(0,45000),
    fields:payload.context.clinical_context && typeof payload.context.clinical_context==="object" && !Array.isArray(payload.context.clinical_context)
      ?payload.context.clinical_context:{}
  };
  const permitted=new Set(payload.allowed_concepts.filter(x=>typeof x==="string"));
  const state=Engine.analyze(context);
  const evidence=fallbackEvidence(context,state);
  const items=[];
  for(const item of state.items||[]){
    if(items.length>=16)break;
    if(!permitted.has(item.concept)||!priorities.has(item.priority)||!evidence)continue;
    if(items.some(x=>x.concept===item.concept))continue;
    items.push({
      concept:item.concept,priority:item.priority,
      category:categories.has(item.category)?item.category:"history",
      contextEvidence:evidence
    });
  }
  const observations=[];
  for(const [concept,f] of Object.entries(state.facts||{})){
    if(observations.length>=32)break;
    if(!permitted.has(concept)||!states.has(f?.state)||!temporal.has(f?.temporal))continue;
    const e=f.currentEvidence;
    const quote=snippet(context,e?.quote,e?.section);
    if(!quote)continue;
    observations.push({
      concept,state:f.state,temporal:f.temporal,subject:"patient",
      section:e.section,quote
    });
  }
  return {schema_version:RADAR_API_CONTRACT,result:{items,observations}};
}
