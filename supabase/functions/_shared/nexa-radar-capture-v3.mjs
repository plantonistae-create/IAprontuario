import concepts from "../realtime-radar/concepts.json" with {type:"json"};
// Safe, strictly categorical backup of the Radar trace. No quotes, answers, patient identifiers,
// original text, transcript, note, raw timestamps or free-form question content.
export const RADAR_CAPTURE_SCHEMA="nexa-radar-capture-v3";
const C=new Set(concepts.map(x=>x.id));
const PRIORITY=new Set(["critical","high","moderate","low"]);
const STATUS=new Set(["to_ask","asked","confirm","answered","covered"]);
const VERSION=/^[A-Za-z0-9._:-]{1,80}$/;
export function sanitizeRadarCapture(value){
 const src=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
 const entries=Array.isArray(src.items)?src.items:[];
 const items=[],seen=new Set();
 for(const item of entries.slice(0,150)){
  if(!item||typeof item!=="object"||Array.isArray(item))continue;
  const concept=String(item.concept||"");
  if(!C.has(concept)||seen.has(concept))continue;
  seen.add(concept);
  items.push({
   concept,priority:PRIORITY.has(item.priority)?item.priority:"moderate",
   status:STATUS.has(item.status)?item.status:"to_ask",
   red_flag:item.redFlag===true
  });
 }
 const string=(value,def="unknown")=>typeof value==="string"&&VERSION.test(value)?value:def;
 return Object.freeze({schema_version:RADAR_CAPTURE_SCHEMA,
  engine_version:string(src.engine_version),
  provider:string(src.provider),
  model_version:string(src.model_version),
  prompt_version:string(src.prompt_version),
  evidence_version:string(src.evidence_version),
  frontend_version:string(src.frontend_version),
  items,raw_transcript_saved:false,clinical_ground_truth:false
 });
}
