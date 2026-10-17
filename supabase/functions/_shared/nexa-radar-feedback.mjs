import catalog from "../realtime-radar/concepts.json" with {type:"json"};
// Privacy-minimized Radar feedback contract for NEXA Core training and evaluation.
// Physician clicks are operational feedback, NOT proof of a medical finding.
export const RADAR_FEEDBACK_SCHEMA_VERSION = "nexa-radar-feedback-v1";
const ALLOWED_ACTIONS = new Set(["answer","evaluated","dismissed","not_applicable"]);
const CONCEPT_ID = /^(?:[a-z][a-z0-9_]{0,63}|conflict:[a-z][a-z0-9_]{0,63})$/;
const KNOWN_CONCEPTS = new Set(catalog.map(c=>c.id));
const integer=(value,max=1000)=>Number.isFinite(Number(value))
  ? Math.max(0,Math.min(max,Math.floor(Number(value)))):0;

export function sanitizeRadarFeedback(value) {
  const source=value && typeof value==="object" && !Array.isArray(value)?value:{};
  const actions=source.actions && typeof source.actions==="object" && !Array.isArray(source.actions)
    ? source.actions:{};
  const entries=[];
  for(const [id,v] of Object.entries(actions).slice(0,120)){
    const action=typeof v==="string"?v:String(v?.action||"");
    const concept=id.startsWith("conflict:")?id.slice(9):id;
    if(!CONCEPT_ID.test(id)||!KNOWN_CONCEPTS.has(concept)||!ALLOWED_ACTIONS.has(action))continue;
    entries.push({concept:id,action,annotation_type:"physician_interaction_not_clinical_ground_truth"});
  }
  const counts={answer:0,evaluated:0,dismissed:0,not_applicable:0};
  for(const item of entries)counts[item.action]++;
  const metrics=source.metrics && typeof source.metrics==="object" ? source.metrics:{};
  return Object.freeze({
    schema_version:RADAR_FEEDBACK_SCHEMA_VERSION,
    actions:entries,
    action_counts:counts,
    metrics:{
      suggested:integer(metrics.suggested),covered:integer(metrics.covered),
      confirm:integer(metrics.confirm),alerts:integer(metrics.alerts)
    },
    no_raw_transcript:true,
    no_phrases_or_patient_identifiers:true,
    human_review_required_for_training_labels:true
  });
}
