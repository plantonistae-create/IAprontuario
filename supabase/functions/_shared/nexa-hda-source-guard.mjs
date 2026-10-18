// Clinical narration guard. Only repairs an unwanted generic SPEAKER PREFIX;
// never alters clinical facts, negations, or information inside the history.
const OTHER_PREFIX = /^(\s*)(?:o\s+)?(?:outro participante|outra pessoa|outro interlocutor|terceiro participante|terceiro interlocutor)\s+(refere|relata|informa|descreve|menciona)\b/i;
const THIRD_PARTY = /(?:^|\n)(?:\[[^\]]{0,40}\]\s*)?ACOMPANHANTE(?:\s*\([^)]*\))?\s*:|\b(?:sou\s+(?:a\s+|o\s+)?(?:mãe|pai|avó|avô|responsável|acompanhante)|minha\s+filha\s+(?:está|teve|sentiu)|meu\s+filho\s+(?:está|teve|sentiu))\b/i;
const PATIENT_VOICE = /(?:^|\n)(?:\[[^\]]{0,40}\]\s*)?PACIENTE\s*:|\b(?:acordei\s+com|despertei\s+com|senti\s+(?:uma?\s+)?dor|estou\s+com\s+dor|tenho\s+dor|meu\s+olho\s+(?:dói|está)|minha\s+visão\s+(?:está|ficou))\b/i;

/**
 * This function is intentionally limited to a sentence-opening attribution.
 * Speaker IDs A/B/C and counts cannot establish a speaker's clinical role.
 * If even the patient vs companion distinction remains unclear, do not guess.
 */
export function normalizeHdaSource(fields,transcript=""){
  if(!fields || typeof fields!=="object" || Array.isArray(fields) || typeof fields.hda!=="string") return fields;
  const match=OTHER_PREFIX.exec(fields.hda);
  if(!match) return fields;
  const t=String(transcript||"").slice(0,120000);
  const third=THIRD_PARTY.test(t),patient=PATIENT_VOICE.test(t);
  let source;
  if(third && !patient) source="Acompanhante";
  else if(patient && !third) source="Paciente";
  else source=null; // conflicting or missing role evidence: preserve neutral provenance
  const label=match[2].toLocaleLowerCase("pt-BR");
  const fixed=fields.hda.replace(OTHER_PREFIX,(_,space)=>(space||"")+(source?source+" "+label:"Durante a consulta, foi relatado"));
  return {...fields,hda:fixed};
}
