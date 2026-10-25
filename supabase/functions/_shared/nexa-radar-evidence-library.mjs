// Shared by NEXA clinical Radar orchestration and the future NEXA Core API.
// Source indexing is NOT validated medical advice and does not ingest copyrighted texts.
export const RADAR_EVIDENCE_CONTRACT="nexa-radar-evidence-v1";
export const RADAR_EVIDENCE_VERSION="2026-10-25.1";
export const RADAR_SOURCES=Object.freeze([
 {id:"ms_chest_upa",publisher:"Ministerio da Saude",title:"Dor toracica - avaliacao UPA",url:"https://linhasdecuidado.saude.gov.br/portal/dor-toracica/unidade-de-pronto-atendimento/avaliacao-conduta/",access:"public",review:"pending"},
 {id:"ms_iam",publisher:"Ministerio da Saude",title:"Suspeita de infarto agudo do miocardio",url:"https://linhasdecuidado.saude.gov.br/portal/infarto-agudo-do-miocardio/unidade-de-atencao-primaria/suspeita-iam/",access:"public",review:"pending"},
 {id:"ms_stroke",publisher:"Ministerio da Saude / Conitec",title:"PCDT AVC isquemico agudo",url:"https://www.gov.br/saude/pt-br/assuntos/pcdt/a/acidente-vascular-cerebral-isquemico-agudo/view",access:"public",review:"pending"},
 {id:"sbc_chest_2025",publisher:"Sociedade Brasileira de Cardiologia",title:"Diretriz Brasileira de Atendimento a Dor Toracica na Unidade de Emergencia 2025",url:"https://abccardiol.org/article/diretriz-brasileira-de-atendimento-a-dor-toracica-na-unidade-de-emergencia-2025/",access:"public",review:"pending"},
 {id:"sbavc_guidelines",publisher:"Sociedade Brasileira de AVC",title:"Diretrizes em AVC - atualizacao outubro de 2026",url:"https://avc.org.br/membros-e-profissionais/diretrizes-avc/",access:"public",review:"pending"},
 {id:"amb_guidelines",publisher:"AMB e sociedades de especialidade",title:"Diretrizes cientificas",url:"https://diretrizes.amb.org.br/",access:"public",review:"pending"},
 {id:"sbp_emergency",publisher:"Sociedade Brasileira de Pediatria",title:"Documentos cientificos de emergencia",url:"https://www.sbp.com.br/departamentos/emergencia/documentos-cientificos/",access:"public",review:"pending"},
 {id:"sbp_fever",publisher:"Sociedade Brasileira de Pediatria",title:"Abordagem da febre aguda em pediatria",url:"https://www.sbp.com.br/departamentos/pediatria-ambulatorial/documentos-cientificos/",access:"public",review:"pending"},
 {id:"nice",publisher:"NICE",title:"Clinical guidelines",url:"https://www.nice.org.uk/guidance",access:"public",review:"pending"},
 {id:"ahrq",publisher:"AHRQ",title:"Diagnostic safety",url:"https://www.ahrq.gov/diagnostic-safety/index.html",access:"public",review:"pending"},
 {id:"uptodate",publisher:"Wolters Kluwer",title:"UpToDate - requer licenca explicita",url:"https://www.wolterskluwer.com/en/solutions/uptodate/policies-legal/permission-to-reproduce",access:"licensed",review:"not_ingested"}
]);
export const RADAR_PLAYBOOKS=Object.freeze([
 {id:"chest_pain",label:"Dor toracica",pattern:/\b(?:dor\s+(?:no|em|do)\s+peito|dor\s+toracica|desconforto\s+toracico)\b/,age:"any",
  sources:["ms_chest_upa","ms_iam","sbc_chest_2025","amb_guidelines"],focus:["onset","dyspnea","syncope","radiation","sweating","bp","spo2","anticoagulant"]},
 {id:"stroke_symptoms",label:"Sintomas neurologicos focais",pattern:/\b(?:deficit\s+neurologico|fraqueza\s+(?:subita|de\s+um\s+lado)|desvio\s+de\s+boca|alteracao\s+da\s+fala|afasia)\b/,age:"adult",
  sources:["ms_stroke","sbavc_guidelines","amb_guidelines"],focus:["onset","focal","consciousness","glucose","bp","anticoagulant"]},
 {id:"acute_dyspnea",label:"Dispneia",pattern:/\b(?:falta\s+de\s+ar|dispneia|desconforto\s+respiratorio)\b/,age:"any",
  sources:["amb_guidelines","nice"],focus:["onset","spo2","rr","effort","chest","fever","hemoptysis"]},
 {id:"pediatric_fever",label:"Febre pediatrica",pattern:/\b(?:febre|febril)\b/,age:"pediatric",
  sources:["sbp_emergency","sbp_fever"],focus:["onset","temperature","consciousness","immuno","vomiting"]}
]);
const norm=x=>String(x??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
export function buildRadarEvidencePlan({fields={},transcript="",allowedConcepts=[]}={}){
 if(!fields||typeof fields!=="object"||Array.isArray(fields)||typeof transcript!=="string"||!Array.isArray(allowedConcepts))throw Error("RADAR_EVIDENCE_INPUT_INVALID");
 // Treat only complaint and documented HDA as activation context; a clinician's question is not a clinical finding.
 const text=norm([fields.queixa_principal,fields.hda].filter(x=>typeof x==="string").join(" ")).slice(0,6000);
 const all=norm([fields.queixa_principal,fields.hda,transcript].filter(x=>typeof x==="string").join(" "));
 const m=all.match(/\b(?:paciente\s+(?:de|com)\s+|idade\s*:?\s*)(\d{1,3})\s*anos\b/);
 const age=m?Number(m[1]):null,allow=new Set(allowedConcepts);
 const packs=[];
 for(const p of RADAR_PLAYBOOKS){
  if(p.age==="pediatric"&&(age===null||age>=18))continue;
  if(p.age==="adult"&&(age===null||age<18))continue;
  const match=p.pattern.exec(text);if(!match)continue;
  if(/\b(?:nega|sem|ausencia\s+de|nao\s+(?:tem|apresenta|relata))\s+$/.test(text.slice(Math.max(0,match.index-32),match.index)))continue;
  packs.push({id:p.id,source_ids:[...p.sources],focus_concepts:p.focus.filter(x=>allow.has(x))});
 }
 const ids=[...new Set(packs.flatMap(p=>p.source_ids))];
 return {schema_version:RADAR_EVIDENCE_CONTRACT,library_version:RADAR_EVIDENCE_VERSION,
   clinical_review:"pending",scope:"retrieval_candidates_only",candidate_playbooks:packs,
   sources:RADAR_SOURCES.filter(x=>ids.includes(x.id)&&x.access==="public").map(({id,title,publisher,url,review})=>({id,title,publisher,url,review}))};
}
