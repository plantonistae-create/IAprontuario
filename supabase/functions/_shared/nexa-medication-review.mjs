// Narrow review aid. It never changes the transcript or the medical record.
// Brand relationships require a verified source; unknown brands remain literal.
const medicines = [
  {id:'omeprazol',names:['omeprazol']},
  {id:'dipirona',names:['novalgina','dipirona']},
  {id:'celestrat',names:['celestrat']},
];
const fold = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const hasName = (text,name) => new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(fold(text));
const volumes = text => [...fold(text).matchAll(/\b(\d{1,4}(?:[,.]\d{1,3})?)\s*m\s?l\b/g)]
  .map(match => match[1].replace(',','.'));
const sameVolume = (text,amount) => volumes(text).includes(amount);

/** Return bounded, review-only flags without any free-text transcript excerpt. */
export function reviewMedicationVolume(transcript, documentedMedication) {
  const alerts=[];
  const add=flag=>{if(!alerts.some(existing=>JSON.stringify(existing)===JSON.stringify(flag)))alerts.push(flag)};
  const documented=fold(documentedMedication);
  const fragments=String(transcript||'').split(/(?<=[.!?;])\s+|\n+/);
  for(const raw of fragments){
    const fragment=fold(raw).trim();
    if(!fragment||/[?]$/.test(fragment)||/^(medico|medica|dr|dra)\s*[:—-]/.test(fragment))continue;
    // A relative's own medicine is not evidence of patient use.
    if(/\b(minha|meu|sua|seu)\s+(filha?|mae|pai|esposa|marido)\b/.test(fragment))continue;
    const mentioned=medicines.flatMap(m=>m.names.filter(n=>hasName(fragment,n)).map(name=>({medicine:m,name})));
    if(!mentioned.length)continue;
    const uniqueIds=new Set(mentioned.map(x=>x.medicine.id));
    for(const {medicine,name} of mentioned){
      const segments=documented.split(/[;\n]+/).filter(segment=>medicine.names.some(n=>hasName(segment,n)));
      if(!segments.length){add({code:'medication_missing',medicine:medicine.id,reported_name:name});continue;}
      if(!hasName(segments.join(';'),name))add({code:'reported_name_changed',medicine:medicine.id,reported_name:name});
      // Do not assign one volume to multiple medicines in the same utterance.
      if(uniqueIds.size!==1)continue;
      for(const amount of new Set(volumes(fragment))){
        if(!segments.some(segment=>sameVolume(segment,amount)))add({code:'volume_missing',medicine:medicine.id,reported_name:name,amount,unit:'mL'});
      }
    }
    if(alerts.length>=8)break;
  }
  return {requires_review:alerts.length>0,alerts:alerts.slice(0,8),version:'medication-review-v1'};
}
