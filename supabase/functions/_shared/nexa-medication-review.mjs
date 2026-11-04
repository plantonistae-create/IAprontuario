// Review aid only. It never changes the transcript or the medical record.
import {catalogVersion,medicines} from './nexa-medication-catalog.mjs';
const fold = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const hasName = (text,name) => new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(fold(text));
const spokenNumbers=Object.freeze({um:'1',uma:'1',dois:'2',duas:'2',tres:'3',quatro:'4',cinco:'5',seis:'6',sete:'7',oito:'8',nove:'9',dez:'10',vinte:'20'});
const unitPattern='m\\s?l|mililitros?|mg|miligramas?|gotas?|comprimidos?|unidades?';
const quantityPattern=new RegExp(`\\b(\\d{1,4}(?:[,.]\\d{1,3})?|${Object.keys(spokenNumbers).join('|')})\\s*(${unitPattern})\\b(?!\\s*(?:\\/|por)\\s*(?:m\\s?l|mililitros?|mg|miligramas?))`,'g');
const quantities = text => [...fold(text).matchAll(quantityPattern)]
  .map(match=>({amount:spokenNumbers[match[1]]||match[1].replace(',','.'),unit:/^(?:m\s?l|mililitro)/.test(match[2])?'mL':/^got/.test(match[2])?'gotas':/^comprimido/.test(match[2])?'comprimidos':/^unidade/.test(match[2])?'unidades':'mg'}));
const frequency=text=>/\b(?:a cada\s+\d+\s+horas?|de\s+\d+\s+em\s+\d+\s+horas?|\d+\s*\/\s*\d+\s*h|(?:uma|duas|tres|\d+)\s+vezes?\s+ao\s+dia|diariamente|todo(?:s)?\s+(?:os\s+)?dias|pela manha|a noite)\b/.test(fold(text));
const negative=text=>/^(?:nega|negou|nunca|sem|nao)\b/.test(text)||/\bnao\s+(?:uso|usa|tomo|toma|tomei|utilizo|utiliza|faz uso)\b/.test(text);

/** Return bounded, review-only flags without any free-text transcript excerpt. */
export function reviewMedicationVolume(transcript, documentedMedication) {
  const alerts=[];
  const add=flag=>{if(!alerts.some(existing=>JSON.stringify(existing)===JSON.stringify(flag)))alerts.push(flag)};
  const documented=fold(documentedMedication);
  const fragments=String(transcript||'').split(/(?<=[.!?;])\s+|\n+|\s+mas\s+/i);
  let speaker='';
  for(const raw of fragments){
    const labeled=fold(raw).trim(),label=labeled.match(/^(medico|medica|dr|dra|paciente|acompanhante)\s*[:—-]\s*/)?.[1];
    if(label)speaker=label;
    const fragment=labeled.replace(/^(?:medico|medica|dr|dra|paciente|acompanhante)\s*[:—-]\s*/,'');
    if(!fragment||/[?]$/.test(fragment)||['medico','medica','dr','dra','acompanhante'].includes(speaker)||negative(fragment))continue;
    // A relative's own medicine is not evidence of patient use.
    if(/\b(minha|meu|sua|seu)\s+(filha?|mae|pai|esposa|marido)\b/.test(fragment))continue;
    const mentioned=medicines.flatMap(m=>m.names.filter(n=>hasName(fragment,n)).map(name=>({medicine:m,name})));
    if(!mentioned.length)continue;
    const uniqueIds=new Set(mentioned.map(x=>x.medicine.id));
    for(const {medicine,name} of mentioned){
      const segments=documented.split(/[;\n]+/).filter(segment=>medicine.names.some(n=>hasName(segment,n)));
      if(!segments.length){
        add({code:'medication_missing',medicine:medicine.id,reported_name:name});
        if(uniqueIds.size===1){
          for(const quantity of quantities(fragment))
            add({code:quantity.unit==='mL'?'volume_missing':'quantity_missing',medicine:medicine.id,reported_name:name,...quantity});
          if(frequency(fragment))add({code:'frequency_missing',medicine:medicine.id,reported_name:name});
        }
        continue;
      }
      if(!hasName(segments.join(';'),name))add({code:'reported_name_changed',medicine:medicine.id,reported_name:name});
      // Do not assign one quantity to multiple medicines in the same utterance.
      if(uniqueIds.size!==1)continue;
      for(const quantity of quantities(fragment)){
        if(!segments.some(segment=>quantities(segment).some(other=>other.amount===quantity.amount&&other.unit===quantity.unit)))
          add({code:quantity.unit==='mL'?'volume_missing':'quantity_missing',medicine:medicine.id,reported_name:name,...quantity});
      }
      if(frequency(fragment)&&!segments.some(segment=>frequency(segment)))add({code:'frequency_missing',medicine:medicine.id,reported_name:name});
    }
    if(alerts.length>=8)break;
  }
  return {requires_review:alerts.length>0,alerts:alerts.slice(0,8),version:'medication-review-v2',catalog_version:catalogVersion};
}
