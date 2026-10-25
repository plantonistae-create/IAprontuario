// NEXA Radar editorial workflow v1: proposals are NOT clinical advice.
// Import intentionally has no network, database, model or auth dependency.
// The caller MUST authenticate reviewer identity and authorize roles before appending reviews.
export const RADAR_EDITORIAL_SCHEMA="nexa-radar-editorial-v1";
export const RADAR_EDITORIAL_PRIORITY=["critical","essential","important","complementary"];
const ids=/^[a-z][a-z0-9_-]{2,79}$/;
const dateRE=/^\d{4}-\d{2}-\d{2}$/;
const safeText=value=>typeof value==="string"&&value.trim().length>=10&&value.trim().length<=520
  && !/<[a-z][^>]*>/i.test(value)&&!/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(value)
  && !/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value);
const validDate=s=>typeof s==="string"&&dateRE.test(s)&&new Date(s+"T00:00:00Z").toISOString().startsWith(s);
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exactKeys=(obj,keys)=>isObject(obj)&&Object.keys(obj).every(x=>keys.includes(x));

/**
 * Draft structured model output into a source-bound review artifact.
 * @param {unknown} raw
 * @param {{sources:Array<{id:string,url:string,access:string}>,playbooks:Array<{id:string,focus:string[],sources:string[]}>,allowedConcepts:string[]}} catalog
 */
export function proposeRadarEditorialQuestion(raw,catalog){
 if(!exactKeys(raw,["id","playbook_id","concept_id","question","why_ask","decision_relevance",
                           "priority_proposal","source_id","source_url","source_version","source_section","checked_at",
                           "population","status","reviews"]))throw Error("RADAR_EDITORIAL_UNKNOWN_FIELDS");
 if(!catalog||!Array.isArray(catalog.sources)||!Array.isArray(catalog.playbooks)||!Array.isArray(catalog.allowedConcepts))
   throw Error("RADAR_EDITORIAL_CATALOG_INVALID");
 const p=catalog.playbooks.find(x=>x.id===raw.playbook_id);
 const source=catalog.sources.find(x=>x.id===raw.source_id);
 if(!p||!source||source.access!=="public"||!p.sources.includes(source.id)||raw.source_url!==source.url)
   throw Error("RADAR_EDITORIAL_SOURCE_NOT_AUTHORIZED");
 if(!ids.test(raw.id)||!p.focus.includes(raw.concept_id)||!catalog.allowedConcepts.includes(raw.concept_id))
   throw Error("RADAR_EDITORIAL_CONCEPT_NOT_ALLOWED");
 if(!safeText(raw.question)||!safeText(raw.why_ask)||!safeText(raw.decision_relevance)
     ||!RADAR_EDITORIAL_PRIORITY.includes(raw.priority_proposal))
   throw Error("RADAR_EDITORIAL_CONTENT_INVALID");
 if(!["any","adult","pediatric"].includes(raw.population)||raw.population!==p.age)
   throw Error("RADAR_EDITORIAL_POPULATION_MISMATCH");
 if(!safeText(raw.source_section)||!safeText(raw.source_version)||!validDate(raw.checked_at))
   throw Error("RADAR_EDITORIAL_PROVENANCE_INCOMPLETE");
 if(raw.checked_at>new Date().toISOString().slice(0,10))throw Error("RADAR_EDITORIAL_FUTURE_SOURCE_DATE");
 if(raw.status!==undefined&&raw.status!=="draft")throw Error("RADAR_EDITORIAL_CANNOT_SELF_APPROVE");
 if(raw.reviews!==undefined&&(!Array.isArray(raw.reviews)||raw.reviews.length))
   throw Error("RADAR_EDITORIAL_CANNOT_SELF_REVIEW");
 const clean=({
   schema_version:RADAR_EDITORIAL_SCHEMA,id:raw.id,
   playbook_id:p.id,concept_id:raw.concept_id,question:raw.question.trim(),
   why_ask:raw.why_ask.trim(),decision_relevance:raw.decision_relevance.trim(),
   priority_proposal:raw.priority_proposal,population:raw.population,
   provenance:{source_id:source.id,source_url:source.url,source_version:raw.source_version.trim(),
     source_section:raw.source_section.trim(),checked_at:raw.checked_at},
   status:"draft",reviews:[]
 });
 return clean;
}

/**
 * Local pure review compiler, NOT an authentication service.
 * Caller must verify reviewer identity, clinical role and provenance before calling.
 */
export function appendRadarEditorialReview(draft,review){
 if(!isObject(draft)||draft.schema_version!==RADAR_EDITORIAL_SCHEMA||draft.status!=="draft"||
    !Array.isArray(draft.reviews))throw Error("RADAR_EDITORIAL_NOT_DRAFT");
 if(!exactKeys(review,["reviewer_id","role","decision","reviewed_at","source_verified","question_verified","clinical_notes"]))
   throw Error("RADAR_EDITORIAL_REVIEW_INVALID");
 if(typeof review.reviewer_id!=="string"||!ids.test(review.reviewer_id)||
    !["physician","clinical_safety"].includes(review.role)||!["approve","reject"].includes(review.decision)||
    !validDate(review.reviewed_at)||review.reviewed_at>new Date().toISOString().slice(0,10)||
    review.source_verified!==true||review.question_verified!==true||
    (review.clinical_notes!==undefined&&!safeText(review.clinical_notes)))
   throw Error("RADAR_EDITORIAL_REVIEW_INVALID");
 if(draft.reviews.some(x=>x.reviewer_id===review.reviewer_id||x.role===review.role))
   throw Error("RADAR_EDITORIAL_REVIEW_NOT_INDEPENDENT");
 if(draft.reviews.some(x=>x.decision==="reject"))throw Error("RADAR_EDITORIAL_REJECTED");
 const reviews=[...draft.reviews,{reviewer_id:review.reviewer_id,role:review.role,
   decision:review.decision,reviewed_at:review.reviewed_at,
   source_verified:true,question_verified:true}];
 return {...draft,reviews,status:review.decision==="reject"?"rejected":"draft"};
}

/**
 * Only a fully reviewed record may enter the release catalogue.
 * Revalidates provenance and text against current source registry.
 * The caller MUST treat approvals as supplied by an authenticated, immutable editorial store.
 */
export function compileApprovedRadarEditorial(entries,{sources,playbooks,allowedConcepts}){
 if(!Array.isArray(entries)||!Array.isArray(sources)||!Array.isArray(playbooks)||!Array.isArray(allowedConcepts))
   throw Error("RADAR_EDITORIAL_COMPILE_INVALID");
 const results=[],seen=new Set();
 for(const entry of entries){
  if(!isObject(entry)||entry.schema_version!==RADAR_EDITORIAL_SCHEMA||
     !isObject(entry.provenance)||!Array.isArray(entry.reviews))continue;
  const p=playbooks.find(x=>x.id===entry.playbook_id),
        src=sources.find(x=>x.id===entry.provenance.source_id);
  if(!p||!src||src.access!=="public"||!p.sources.includes(src.id)||
     entry.provenance.source_url!==src.url||
     !p.focus.includes(entry.concept_id)||!allowedConcepts.includes(entry.concept_id)||
     !["any","adult","pediatric"].includes(entry.population)||entry.population!==p.age||
     !safeText(entry.question)||!safeText(entry.why_ask)||!safeText(entry.decision_relevance)||
     !RADAR_EDITORIAL_PRIORITY.includes(entry.priority_proposal)||
     !safeText(entry.provenance.source_version)||!safeText(entry.provenance.source_section)||
     !validDate(entry.provenance.checked_at)||
     !ids.test(entry.id)||seen.has(entry.id))continue;
  const reviewers=entry.reviews;
  const md=reviewers.find(x=>x?.role==="physician"&&x.decision==="approve"&&x.source_verified===true&&x.question_verified===true);
  const safety=reviewers.find(x=>x?.role==="clinical_safety"&&x.decision==="approve"&&x.source_verified===true&&x.question_verified===true);
  if(reviewers.length!==2||!md||!safety||md.reviewer_id===safety.reviewer_id||
     !ids.test(md.reviewer_id)||!ids.test(safety.reviewer_id)||
     !validDate(md.reviewed_at)||!validDate(safety.reviewed_at)||
     reviewers.some(x=>x.reviewed_at<entry.provenance.checked_at||x.reviewed_at>new Date().toISOString().slice(0,10)))continue;
  seen.add(entry.id);
  results.push({id:entry.id,playbook_id:p.id,concept_id:entry.concept_id,
    question:entry.question,why_ask:entry.why_ask,
    decision_relevance:entry.decision_relevance,priority_proposal:entry.priority_proposal,
    source:{id:src.id,url:src.url,document_version:entry.provenance.source_version,
      locator:entry.provenance.source_section},
    review:{status:"clinically_approved",reviewed_at:[md.reviewed_at,safety.reviewed_at].sort().at(-1)}});
 }
 return results;
}

export function selectRadarReviewedQuestions({plan,approved=[]}={}){
 if(!plan||!Array.isArray(plan.candidate_playbooks)||!Array.isArray(approved))
   throw Error("RADAR_EDITORIAL_SELECTION_INVALID");
 const active=new Set(plan.candidate_playbooks.map(x=>x.id));
 const validSources=new Set(plan.sources.map(x=>x.id));
 return approved.filter(q=>q?.review?.status==="clinically_approved"&&active.has(q.playbook_id)&&validSources.has(q.source.id));
}
