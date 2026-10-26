/* Contextual gap engine. No network, DOM, inferred normal findings or diagnoses. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NexaRadarEngine=api})(globalThis,()=>{
  'use strict';
  const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const rank={critical:0,high:1,moderate:2,low:3};
  const sections=['queixa_principal','hda','alergias','comorbidades','medicacoes','antecedentes','exame_fisico','sinais_vitais'];
  const universal=new Set(['comorbidities','allergies','medicines']);
  // Each concept has evidence aliases and an explicit documentation destination.
  const concepts={};
  function c(id,label,pattern,section='hda',type='boolean'){concepts[id]={id,label,pattern,section,type};}
  c('trauma','Trauma recente',/\b(?:trauma\w*|entorse|torc[ei]\w*|torceu|queda|caiu|impacto|acidente)\b/);
  c('chest','Dor torácica',/dor (?:toracica|no peito|precordial)/);
  c('abdomen','Dor abdominal',/dor (?:abdominal|na barriga|em (?:fossa|hipocondrio|epigastrio))|abdominalgia/);
  c('headache','Cefaleia',/cefaleia|dor de cabeca/);
  c('back','Lombalgia',/lombalgia|dor (?:lombar|nas costas)/);
  c('limb','Queixa em membro',/(?:dor|edema|inchac\w*|inchad\w*).{0,50}(?:perna|membro|tornozelo|braco|panturrilha)|(?:tornozelo|perna|membro).{0,45}(?:dor|inchad\w*|edema)/);
  c('urinary','Sintomas urinários',/disuria|ardencia ao urinar|polaciuria|urgencia (?:miccional|urinaria)/);
  c('respiratory','Sintomas respiratórios',/tosse|dispneia|falta de ar|chiado/);
  c('neuro','Queixa neurológica',/tontura|vertigem|parestesia|fraqueza|dormencia|convulsao/);
  c('fever','Febre',/febre|febril|afebril/);
  c('dyspnea','Dispneia',/dispneia|falta de ar|dificuldade (?:para )?respirar|eupneic\w*/);
  c('syncope','Síncope',/sincope|desmaio|desmaiou/);
  c('sweating','Sudorese',/sudorese|suor frio/);
  c('focal','Déficit neurológico focal',/deficit(?:s)? (?:neurologic\w* )?foca\w*|hemiparesia|hemiplegia|assimetria facial|disartria/,'exame_fisico');
  c('consciousness','Alteração de consciência',/(?:alteracao|rebaixamento|perda) (?:da |de )?consciencia|inconscien\w*|glasgow\s*[:=]?\s*\d+|lucid\w*|confusao mental|desorientad\w*|sonolen\w*/,'exame_fisico','text');
  c('sudden','Início súbito / máxima intensidade',/inicio subito|subitamente|subita|de repente|trovoada|maxima intensidade/);
  c('meningism','Rigidez de nuca / meningismo',/rigidez (?:de |da )?nuca|meningismo|sinais meningeos/,'exame_fisico');
  c('peritonism','Sinais de irritação peritoneal',/peritonismo|defesa abdominal|rigidez abdominal|blumberg|descompressao brusca/,'exame_fisico');
  c('vomiting','Vômitos persistentes',/vomitos persistentes|vomitando continuamente/);
  c('bleeding','Sangramento',/sangramento|hematemese|melena|hematoquezia/);

  // Syndrome-specific PS differentiation, not universal mandatory questions.
  c('diarrhea','Diarreia aguda',/\bdiarrei\w*|gastroenterite|enterocolite|evacuac\w* liquidas?|fezes liquidas?/);
  c('stoolBlood','Sangue nas fezes',/\bsangue (?:vivo )?(?:nas?|misturado (?:as?|com as?)) fezes\b|diarreia com sangue|evacuac\w* sanguinolent\w*|disenteria|hematoquezia/);
  c('stoolMucus','Muco nas fezes',/\bmuco(?:sidade)? (?:nas?|misturado (?:as?|com as?)) fezes\b|fezes com muco|diarreia com muco/);
  c('stoolPus','Pus nas fezes',/\bpus nas? fezes\b|fezes com pus|diarreia purulenta/);
  c('hydration','Estado de hidratação',/\bdesidrat\w*|hidratad\w*|mucosas? (?:secas?|umidas?)|sede intensa|olhos fundos/,'exame_fisico','text');
  c('oralTolerance','Tolerância à ingestão oral',/\b(?:toler\w*|aceita\w*|consegue\w*|mantem)\b.{0,30}\b(?:via oral|liquidos?|agua|aliment\w*)\b|\b(?:nao consegue|incapaz de)\b.{0,30}\b(?:beber|ingerir)\b/,'hda','text');
  c('urineOutput','Diurese / redução urinária',/\bdiurese\b|\b(?:urina|urinou|urinando|micc\w*)\b.{0,30}\b(?:menos|pouco|normal|reduzid\w*|diminu\w*|mantid\w*)\b|\boliguri\w*|\banuri\w*/,'hda','text');
  c('stoolFrequency','Frequência das evacuações',/\b(?:\d+|varias|muitas|poucas)\s*(?:vezes|episodios|evacuacoes)\b.{0,35}\b(?:dia|diarreia|fezes)\b|\b(?:evacuac\w*|diarrei\w*)\b.{0,30}\b(?:\d+|varias vezes|frequentes?)\b/,'hda','text');
  c('giVomiting','Vômitos / hidratação oral',/\bvomit\w*|\bvomitand\w*|\bemese\b|\bnause\w*/,'hda');
  c('severeAbdominalPain','Dor abdominal intensa ou localizada',/\bdor (?:abdominal|na barriga)\b.{0,35}\b(?:intensa?|forte|localizad\w*|progressiv\w*)\b|\b(?:dor intensa?|defesa|abdome agudo)\b.{0,25}\babdomin\w*/,'hda');
  c('photophobia','Fotofobia',/\bfotofobi\w*|\bsensibilidade (?:a|a )?luz\b/,'hda');
  c('phonophobia','Fonofobia',/\bfonofobi\w*|\bsensibilidade (?:a|ao) som\b/,'hda');
  c('headacheNausea','Náuseas ou vômitos com cefaleia',/\bnause\w*|\bvomit\w*|\bemese\b/,'hda');
  c('headachePattern','Mudança de padrão / progressão da cefaleia',/\b(?:mudanc\w*|alterac\w*) (?:do |de )?padrao\b|\b(?:dor|cefaleia)\b.{0,40}\b(?:diferente|progressiv\w*|pior\w*|nova|primeira)\b/,'hda','text');
  c('respFocal','Achados focais à ausculta pulmonar',/\bcrepit\w*|\bestertor\w*|\bconsolidac\w*|\bsopro tubari\w*|\b(?:murmurio vesicular)\b.{0,30}\b(?:reduzid\w*|diminu\w*)/,'exame_fisico','text');
  c('wheeze','Sibilos / broncoespasmo',/\bsibil\w*|\bchiad\w*|\bbroncoespasmo\b/,'exame_fisico');
  c('speechLimit','Limitação para falar frases',/\b(?:fala|consegue falar|falar)\b.{0,35}\b(?:frases?|palavras?|entrecortad\w*|dificuldade)\b|\bnao consegue (?:completar|falar) frases\b/,'exame_fisico','text');
  c('pleuriticPain','Dor torácica pleurítica',/\bdor\b.{0,30}\b(?:respirar|inspirar|pleurit\w*)\b|\bdor pleurit\w*/,'hda');

  // Broad chief-complaint routing. These are prompts for clinical assessment,
  // NOT validated diagnosis rules or discharge/antibiotic recommendations.
  c('throatPain','Dor de garganta',/\b(?:dor de garganta|odinofagia|faringite|amigdalite|tonsilite)\b/);
  c('swallowDifficulty','Disfagia / dificuldade para deglutir',/\bdisfagi\w*|dificuldade (?:para )?(?:engolir|deglutir)|nao consegue engolir/);
  c('stridor','Estridor / obstrução de via aérea',/\bestridor|ruido inspiratorio|obstruc\w* de via aerea/,'exame_fisico');
  c('exudate','Exsudato tonsilar',/\bexsudat\w*|placas? (?:nas?|em) amigdala|amigdalas? com placas?/,'exame_fisico');
  c('cervicalNodes','Linfonodos cervicais dolorosos',/\b(?:linfonod\w*|adenopati\w*|gangli\w*)\b.{0,35}\b(?:cervic\w*|pescoço|doloros\w*)/,'exame_fisico','text');
  c('earPain','Otalgia',/\b(?:otalgia|dor (?:no|de) ouvido|otite)\b/);
  c('earDischarge','Otorreia',/\b(?:otorrei\w*|secrec\w* no ouvido|saida de secrecao pelo ouvido)\b/);
  c('hearingChange','Alteração auditiva',/\b(?:hipoacusi\w*|perda auditiva|audicao reduzida)\b/);
  c('sinusSymptoms','Sintomas nasossinusais',/\b(?:sinusite|rinossinusite|dor facial|pressao facial|secrecao nasal|coriza)\b/);
  c('unilateralSinus','Dor facial unilateral importante',/\bdor (?:facial|na face)\b.{0,30}\b(?:unilateral|forte|intensa)\b/);
  c('jointPain','Artralgia / dor articular',/\b(?:artralgia|artrite|dor (?:no|na|nos|nas) (?:joelho|ombro|cotovelo|punho|quadril|articulac\w*)|joelho doloroso)\b/);
  c('jointHot','Articulação quente / hiperemiada',/\b(?:articulac\w*|joelho|tornozelo)\b.{0,45}\b(?:quente|calor|hiperemi\w*|vermelh\w*|rubor)\b/,'exame_fisico');
  c('jointRange','Amplitude de movimento / limitação funcional',/\b(?:amplitude de movimento|mobilidade|movimentac\w*|flexao|extensao|limitac\w* funcional|limita\w* movimento)\b/,'exame_fisico','text');
  c('weightBearing','Capacidade de apoiar / caminhar',/\b(?:consegue|incapaz|impossib\w*|dificuldade de)\b.{0,30}\b(?:andar|caminhar|apoiar|deambular)\b|\bapoio de peso\b/,'hda','text');
  c('jointEffusion','Derrame articular / edema localizado',/\b(?:derrame articular|hidartrose|edema articular|joelho inchado|joelho com edema)\b/,'exame_fisico','text');
  c('wound','Ferida aberta / exposição',/\b(?:ferida aberta|ferimento aberto|exposicao ossea|fratura exposta|lacerac\w*)\b/,'exame_fisico');
  c('paresthesia','Parestesia ou déficit sensitivo',/\b(?:parestesi\w*|formigamento|dormencia|perda de sensibilidade)\b/,'hda');
  c('radicular','Dor irradiada / ciatalgia',/\b(?:ciatalgia|ciatica|radiculopati\w*|dor irradiad\w* para (?:perna|membro inferior))\b/);
  c('backRedSystemic','Sinais sistêmicos / risco de infecção ou neoplasia',/\b(?:perda de peso inexplicada|cancer|neoplasia|imunossupress\w*|uso de drogas intravenosas)\b/,'antecedentes','text');
  c('constipation','Constipação intestinal',/\b(?:constipac\w*|obstipac\w*|intestino preso|sem evacuar|prisao de ventre)\b/);
  c('obstruction','Distensão, parada de gases / fezes',/\b(?:distensao abdominal|abdome distendido|parada de eliminacao de gases|nao elimina gases|obstrucao intestinal)\b/);
  c('upperGI','Dispepsia / epigastralgia',/\b(?:epigastralgia|dispepsia|azia|pirose|queimacao no estomago)\b/);
  c('giBleed','Sangramento digestivo',/\b(?:melena|hematemese|vomito com sangue|sangramento digestivo|sangue nas fezes)\b/);
  c('hemodynamic','Instabilidade hemodinâmica / pré-síncope',/\b(?:instabilidade hemodinamica|hipotensao|lipotimia|pre-sincope)\b/);
  c('palpitations','Palpitações',/\b(?:palpitac\w*|coracao acelerado|taquicardia percebida)\b/);
  c('exertional','Relação com esforço',/\b(?:aos? esforc\w*|ao caminhar|ao subir escadas|com exercicio)\b/,'hda','text');
  c('legSwelling','Edema assimétrico de membro inferior',/\b(?:edema|inchaco|perna inchada)\b.{0,35}\b(?:unilateral|assimetr\w*|perna|panturrilha)\b/,'exame_fisico','text');
  c('dizziness','Tontura / vertigem',/\b(?:tontura|vertigem|labirintite|sensacao de girar)\b/);
  c('gaitChange','Alteração de marcha / ataxia',/\b(?:ataxia|marcha alterada|dificuldade para caminhar|desequilibrio importante)\b/,'exame_fisico');
  c('visionChange','Alteração visual aguda',/\b(?:perda visual|visao turva|diplopia|visao dupla|baixa visual subita)\b/);
  c('seizure','Crise convulsiva',/\b(?:convulsao|crise convulsiva|crise epileptica|epilepsia em crise)\b/);
  c('postictal','Confusão pós-ictal / recuperação',/\b(?:pos.ictal|pos crise|recuperacao apos crise|confusao apos convulsao)\b/,'hda','text');
  c('urinaryFever','Febre associada a sintomas urinários',/\b(?:febre|calafrios|tremores)\b/);
  c('urinaryRetention','Retenção urinária atual',/\b(?:retencao urinaria|nao consegue urinar|bexiga cheia sem urinar)\b/);
  c('colic','Cólica renal / dor em flanco',/\b(?:colica renal|nefrolitiase|calcul\w* renal|dor (?:no|em) flanco)\b/);
  c('testicularPain','Dor testicular aguda',/\b(?:dor testicular|torcao testicular|escroto doloroso|dor no testiculo)\b/);
  c('pelvicPain','Dor pélvica',/\b(?:dor pelvica|dor no baixo ventre|dor hipogastrica|anexite)\b/);
  c('vaginalBleeding','Sangramento vaginal',/\b(?:sangramento vaginal|sangramento uterino|metrorragia)\b/);
  c('rash','Lesão cutânea / exantema',/\b(?:rash|exantema|lesao de pele|urticaria|manchas na pele|erupcao cutanea)\b/);
  c('skinSpread','Progressão rápida / extensão cutânea',/\b(?:vermelhidao se espalhando|lesao progredindo|aumento rapido da lesao|eritema progressivo)\b/);
  c('skinPainDisproportion','Dor desproporcional em lesão cutânea',/\bdor desproporcional\b|dor muito intensa na pele/);
  c('eyePain','Dor ocular / olho vermelho',/\b(?:dor ocular|olho vermelho|conjuntivite|dor no olho)\b/);
  c('photopsia','Fotopsias / moscas volantes / perda de campo',/\b(?:fotopsi\w*|moscas volantes|perda de campo visual|flashes de luz)\b/);
  c('foreignBody','Corpo estranho / exposição ocular',/\b(?:corpo estranho|produto quimico no olho|trauma ocular)\b/);
  c('pregnancy','Possibilidade de gestação / puerpério',/gesta\w*|gravid\w*|puerper\w*|menopausa|histerectomia/,'antecedentes','text');
  c('anticoagulant','Uso de anticoagulante',/anticoagul\w*|varfarina|rivaroxabana|apixabana|dabigatrana|heparina/,'medicacoes');
  c('cvRisk','Fatores de risco cardiovascular',/hipertens\w*|\bhas\b|diabet\w*|tabag\w*|dislipidem\w*|fatores (?:de risco )?cardiovasculares/,'comorbidades','text');
  c('mechanism','Mecanismo do trauma',/queda (?:da propria altura|de .{0,30})|jogando|futebol|colisao|atropelamento|inversao|eversao/,'hda','text');
  c('neurovascular','Avaliação neurovascular distal',/neurovascular.{0,35}(?:preservad\w*|normal|alterad\w*|sem alteracoes)|pulsos.{0,35}(?:sensibilidade|motricidade)/,'exame_fisico','text');
  c('deformity','Deformidade',/deformidade/,'exame_fisico');
  c('weightThen','Apoio imediatamente após o trauma',/(?:apoi\w*|anda\w*|passos).{0,40}(?:imediatamente|logo apos)|(?:imediatamente|logo apos).{0,40}(?:apoi\w*|anda\w*|passos)/,'hda','text');
  c('fourSteps','Capacidade atual de dar quatro passos',/(?:quatro|4) passos/,'exame_fisico','text');
  c('malleoli','Palpação dos maléolos',/maleol\w*.{0,35}(?:dor|dolor|indolor)|(?:dor|dolor|indolor|palpacao).{0,35}maleol/,'exame_fisico','text');
  c('midfoot','Palpação do navicular e base do quinto metatarso',/(?:navicular.{0,60}(?:quinto|5|v) metatars|(?:quinto|5|v) metatars.{0,60}navicular)/,'exame_fisico','text');
  c('pulses','Pulsos periféricos',/pulsos.{0,30}(?:presente|ausente|palpave|simetric|diminu|normal)/,'exame_fisico','text');
  c('perfusion','Perfusão periférica',/perfusao.{0,25}(?:preserv|normal|reduz|alter)|\btec\s*[<>=]?\s*\d/,'exame_fisico','text');
  c('edema','Edema / assimetria',/edema|inchad\w*|inchaco|assimetria/,'exame_fisico','text');
  c('dvtRisk','Fatores de risco tromboembólico',/imobiliza\w*|trombose previa|tvp previa|viagem prolongada|risco tromboembolico/,'antecedentes','text');
  c('saddle','Anestesia em sela',/anestesia em sela|sensibilidade perineal/);
  c('retention','Retenção urinária / alteração esfincteriana',/retencao urinaria|incontinencia|alteracao esfincteriana/);
  c('weakness','Fraqueza progressiva',/fraqueza progressiva|perda progressiva de forca/);
  c('flank','Dor em flancos',/dor (?:em |nos? )?flancos?/);
  c('hematuria','Hematúria',/hematuria|sangue na urina/);
  c('auscultation','Ausculta respiratória',/\bmv(?:ua)?\b|ausculta.{0,40}(?:normal|crepit|sibil|estert|diminu)|murmurio vesicular/,'exame_fisico','text');
  c('effort','Esforço respiratório',/esforco respiratorio|tiragem|uso de musculatura acessoria/,'exame_fisico');
  c('hemoptysis','Hemoptise',/hemoptise|sangue ao tossir/);
  c('immuno','Imunossupressão',/imunossupre\w*|quimioterapia|neutropenia/,'comorbidades','text');
  c('localization','Localização da dor',/(?:dor|cefaleia|lombalgia).{0,45}(?:torac|abdomin|cabeca|peito|lombar|perna|tornozelo|membro|flanco|fossa|hipocondrio|epigastr|braco)|lombalgia|cefaleia/,'hda','text');
  c('onset','Início / duração',/ha (?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s*(?:horas?|dias?|semanas?|meses?|minutos?)|desde|ontem|hoje|iniciou|comecou|inicio subito/,'hda','text');
  c('character','Caráter da dor',/pontada|queimacao|aperto|pulsatil|colica|latejan\w*|peso/,'hda','text');
  c('intensity','Intensidade da dor',/\b\d{1,2}\s*\/\s*10\b|intensidade.{0,20}\d|dor (?:leve|moderada|forte|intensa)/,'hda','text');
  c('radiation','Irradiação da dor',/irradi\w*/,'hda','text');
  c('aggravation','Fatores de piora',/piora (?:com|ao)|agrava|pior ao/,'hda','text');
  c('relief','Fatores de melhora',/melhora (?:com|ao)|alivia|sem alivio/,'hda','text');
  c('evolution','Evolução da dor',/progressiv\w*|intermitente|recorrente|constante|melhorando|piorando|estavel desde/,'hda','text');
  c('comorbidities','Comorbidades',/.+/,'comorbidades','text');
  c('medicines','Medicações utilizadas',/.+/,'medicacoes','text');
  c('allergies','Alergias',/.+/,'alergias','text');
  c('bp','Pressão arterial',/\b(?:pa|pressao arterial|pressao)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*\d{2,3}\s*(?:[x\/]|por)\s*\d{2,3}/,'sinais_vitais','text');
  c('hr','Frequência cardíaca',/\b(?:fc|frequencia cardiaca)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*\d{2,3}/,'sinais_vitais','text');
  c('rr','Frequência respiratória',/\b(?:fr|frequencia respiratoria)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*\d{1,3}/,'sinais_vitais','text');
  c('spo2','Saturação de oxigênio',/\b(?:spo2|sato2|saturacao)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*\d{2,3}/,'sinais_vitais','text');
  c('temperature','Temperatura aferida',/(?:\b(?:3\d|4[0-3])(?:[.,]\d)?\s*°\s*c?|(?:temperatura|febre|\bt\b)\s*(?:de|:|=)?\s*(?:3\d|4[0-3])(?:(?:[.,]\d)|(?:\s+e\s+meio))?)/,'sinais_vitais','text');
  c('glucose','Glicemia',/(?:glicemia|hgt|dextro)\s*[:=]?\s*\d{2,3}/,'sinais_vitais','text');
  c('dvt','TVP no diagnóstico diferencial',/tvp|trombose venosa profunda/,'sugestoes_perguntas','text');
  const symptomIds=new Set(['chest','abdomen','headache','back','limb','urinary','respiratory','neuro','fever','trauma','diarrhea']);
  // Interpret questions separately from patient evidence. No conversational inference is written to the record.
  function conversation(text=''){
    const evidence=[],asked={},uncertain={};let pending=[];
    const parts=String(text).match(/[^!?;\n]+[!?;\n]?/g)||[];
    const sentences=parts.flatMap(p=>p.split(/\.(?!\d)/).filter(x=>x.trim()));
    for(const raw of sentences){
      const quote=raw.trim(),t=norm(quote).replace(/^(?:medic[oa]|profissional|paciente|acompanhante):\s*/,''),ids=Object.values(concepts).filter(c=>!['comorbidities','medicines','allergies'].includes(c.id)&&c.pattern.test(t)).map(c=>c.id);
      const question=/\?\s*$/.test(quote)||/^(?:voce (?:tem|teve|sente|sentiu)|ha algum|quando |onde |como |qual |desde quando |a dor .*(?:\bou\b|\?$))/.test(t);
      const third=/\b(?:minha|meu|sua|seu) (?:mae|pai|irma|irmao|esposa|marido|filh[oa]|avo)\b|^(?:a mae|o pai|a esposa|o marido) (?:tem|teve|sente|apresenta)/.test(t);
      const proposed=/^(?:investigar|considerar|avaliar|perguntar|se (?:tiver|apresentar)|caso (?:tenha|apresente))\b/.test(t);
      if(third||proposed){pending=[];continue;}
      if(question){pending=ids.filter(id=>!symptomIds.has(id));if(!pending.length)pending=ids;const booleanIds=pending.filter(id=>concepts[id].type==='boolean');if(booleanIds.length)pending=booleanIds;pending.forEach(id=>asked[id]={quote,section:'transcript',alternatives:/\bou\b/.test(t)});continue;}
      const short=/^(?:sim|nao|nunca|nenhum[a]?|nao sei|nao lembro|talvez|acho que|nao entendi)(?:[,.!\s]|$)/.test(t);
      if(pending.length&&short){
        const ambiguous=pending.length!==1||pending.some(id=>asked[id].alternatives)||/nao sei|nao lembro|talvez|acho que|nao entendi/.test(t);
        for(const id of pending){
          const c=concepts[id],state=ambiguous?'unknown':/^(?:nao|nunca|nenhum)/.test(t)?'known_absent':/^sim\b/.test(t)?'known_present':'unknown';
          if(c.type!=='boolean'||ambiguous){uncertain[id]={quote,questionQuote:asked[id].quote,section:'transcript',state:'unknown',temporal:'current'};}
          else evidence.push({concept:id,quote,questionQuote:asked[id].quote,section:'transcript',state,temporal:'current'});
        }
        // Keep specific spontaneous details even when an elliptical answer could not resolve a compound question.
      }
      evidence.push({text:quote,section:'transcript'});pending=[];
    }
    return {evidence,asked,uncertain};
  }
  // Core-history utterances must be processed from completed speech, not only
  // from the final structured fields. An unanswered clinician question is not evidence.
  // The matcher is deliberately conservative: no relative history, hypothetical
  // scenarios or isolated denials of one specific disease are global negatives.
  function spokenCoreHistory(transcript=''){
    const out={comorbidities:[],allergies:[],medicines:[],asked:{}};
    const cues={
      comorbidities:/\b(?:comorbid\w*|doencas? (?:cronicas?|preexistentes?|conhecidas?)|problemas? de saude|antecedentes? pessoais)\b/,
      allergies:/\b(?:alerg\w*|reac(?:ao|oes) (?:a|ao) (?:medicamentos?|remedios?))\b/,
      medicines:/\b(?:medic\w*|remedios?|farmacos?|uso continuo|uso regular|faz uso|tomo|toma|tomando|utilizo|utiliza)\b/
    };
    const disease=/\b(?:hipertens\w*|diabet\w*|asmatic\w*|asma|dpoc|hipotireoid\w*|epileps\w*|cardiopatia|doenca renal|insuficiencia cardiaca|depressao|fibromialgia|lupus|artrite|artrose|dislipid\w*|hipercolesterol\w*|doenca hepatica)\b/;
    const drug=/\b(?:losartana|enalapril|captopril|metformina|insulina|levotiroxina|omeprazol|rivaroxabana|apixabana|dipirona|paracetamol)\b/;
    let pending='';
    for(const raw of String(transcript).match(/[^.!?;\n]+[.!?;\n]?/g)||[]){
      const speaker=norm(raw).match(/^\s*(medic[oa]|profissional|paciente|acompanhante)\s*:/)?.[1]||'';
      const t=norm(raw).replace(/^(?:medic[oa]|profissional|paciente|acompanhante)\s*:\s*/,'').replace(/[.!?;\s]+$/,'').trim();
      if(!t)continue;
      if(/\b(?:minha|meu|sua|seu) (?:mae|pai|irma|irmao|esposa|marido|filh[oa]|avo)\b|^(?:a mae|o pai|a esposa|o marido) (?:tem|teve|usa)\b/.test(t)){pending='';continue;}
      const targets=Object.keys(cues).filter(id=>cues[id].test(t));
      if(/[?]\s*$/.test(raw.trim())||/^(?:voce|o senhor|a senhora|paciente) (?:tem|possui|usa|toma|faz uso)\b/.test(t)&&speaker==='medico'){
        pending=targets.length===1?targets[0]:'';
        if(pending&&speaker!=='paciente'&&speaker!=='acompanhante')out.asked[pending]={quote:raw.trim(),section:'transcript'};
        continue;
      }
      // A question/statement from the clinician cannot document an answer.
      if(speaker==='medico'||speaker==='medica'||speaker==='profissional'||speaker==='acompanhante'){pending='';continue;}
      if(/^(?:investigar|considerar|avaliar|perguntar|caso (?:tenha|apresente))\b/.test(t)){pending='';continue;}
      const unknown=/\b(?:nao sei|nao sabe|nao lembro|nao informado|nao relatado|desconhec\w*|talvez|acho que|nao entendi)\b/.test(t);
      const candidates=new Set(targets);
      const answerTo=pending;pending='';
      if(answerTo)candidates.add(answerTo);
      if(!candidates.size&&disease.test(t)&&/^(?:(?:eu|o paciente|a paciente)\s+)?(?:tenho|sou|possuo|apresento|refiro|tem|possui|apresenta)\b/.test(t))candidates.add('comorbidities');
      for(const id of candidates){
        let state='unknown';
        const neg=/^(?:nao|nunca|nenhum[a]?|nego|nega|negou|sem)\b/.test(t)||/\b(?:nega|negou|sem|nao (?:tenho|tem|possui|uso|usa|tomo|toma|faz uso))\b/.test(t);
        if(!unknown){
          if(id==='allergies'){
            const absent=/\b(?:nega|negou|sem|nao (?:tenho|tem|possui))\s+(?:nenhuma?\s+)?alerg\w*/.test(t)||answerTo===id&&/^(?:nao|nunca|nenhuma?)$/.test(t);
            const present=/(?:\balerg\w*\s+(?:a|ao)\s+\w+|\breacao (?:a|ao)\s+\w+)/.test(t)||answerTo===id&&/^sim[, ]+\S+/.test(t);
            state=absent&&!present?'known_absent':present&&!absent?'known_present':'unknown';
          }else if(id==='medicines'){
            const absent=/\b(?:nega|negou|sem|nao (?:uso|usa|tomo|toma|faz uso|utilizo|utiliza))\s+(?:(?:uso|faz uso)\s+(?:de\s+)?)?(?:nenhum[a]?\s+|de\s+)?(?:medic\w*|remedios?|farmacos?|uso continuo|nada\b)/.test(t)||answerTo===id&&/^(?:nao|nunca|nenhum[a]?|nao (?:tomo|uso|faco uso) nada)$/.test(t);
            const present=/\b(?:uso|usa|tomo|toma|utilizo|utiliza|faz uso de|em uso de)\s+(?:\w+\s+){0,3}(?:\d+\s*mg|losartana|metformina|insulina|levotiroxina|enalapril|captopril|rivaroxabana|apixabana|omeprazol|medic\w*|remedios?)/.test(t)||answerTo===id&&(drug.test(t)||/\b\d+\s*(?:mg|mcg|ml)\b/.test(t)||/^sim[, ]+\S{3,}/.test(t));
            state=absent&&!present?'known_absent':present&&!absent?'known_present':'unknown';
          }else{
            const absent=/\b(?:nega|negou|sem|nao (?:tenho|tem|possui))\s+(?:comorbid\w*|doencas?|problemas? de saude|antecedentes? pessoais)/.test(t)||answerTo===id&&/^(?:nao|nunca|nenhum[a]?)$/.test(t);
            const present=disease.test(t)&&!neg||answerTo===id&&(disease.test(t)&&!neg||/^sim[, ]+\S{4,}/.test(t));
            state=absent&&!present?'known_absent':present&&!absent?'known_present':'unknown';
          }
        }
        // Do not manufacture a negative finding from unrelated or missing text.
        if(state==='unknown'&&!(answerTo===id&&(/^(?:nao sei|nao lembro|talvez|acho que)/.test(t)))&&!targets.includes(id))continue;
        out[id].push({state,temporal:'current',section:'transcript',quote:raw.trim()});
      }
    }
    return out;
  }
  // Demographics come from explicit patient statements/fields, never from names, voice or relatives.
  function demographics(context={}){
    const fields=context.fields||{},evidence={age:[],sex:[]};
    const add=(key,value,quote,section)=>evidence[key].push({value,quote,section});
    const age=String(context.age||fields.idade||'').trim(),sex=norm(context.sex||fields.sexo||'');
    if(/^\d{1,3}$/.test(age)&&+age>0&&+age<=120)add('age',+age,age,'idade');
    if(/^(?:f|feminino|mulher|m|masculino|homem)$/.test(sex))add('sex',/^(?:f|feminino|mulher)$/.test(sex)?'feminino':'masculino',sex,'sexo');
    for(const source of [...['queixa_principal','hda'].map(section=>({section,text:fields[section]||''})),{section:'transcript',text:context.transcript||''}]){
      for(const turn of conversation(source.text).evidence.filter(e=>e.text)){
        const t=norm(turn.text).replace(/^(?:paciente|medic[oa]):\s*/,''),correction=/retificacao|corrigindo|na verdade|corrijo/.test(t);
        if(/nao sei|nao sabe|talvez|acho que/.test(t))continue;
        const a=t.match(/\b(?:paciente(?: (?:mulher|homem))?|mulher|homem|menina|menino|idade|tenho|estou com)(?:\s*(?:de|com|:|,))?\s*(\d{1,3})\s*anos\b/);
        const s=t.match(/\bsexo\s*:?\s*(feminino|masculino)\b|^(?:paciente\s*:?\s*)?(mulher|homem)\b/);
        if(a&&+a[1]>0&&+a[1]<=120){if(correction)evidence.age=[];add('age',+a[1],turn.text,source.section);}
        if(s){if(correction)evidence.sex=[];add('sex',/feminino|mulher/.test(s[1]||s[2])?'feminino':'masculino',turn.text,source.section);}
      }
    }
    const out={evidence,conflicts:[]};
    for(const key of ['age','sex']){const values=[...new Set(evidence[key].map(e=>e.value))];out[key]=values.length===1?values[0]:'';if(values.length>1)out.conflicts.push(key);}
    return out;
  }
  function measurement(id,text){
    const t=norm(text),patterns={bp:/(?:pa|pressao arterial|pressao)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{2,3})\s*(?:[x\/]|por)\s*(\d{2,3})/,hr:/(?:fc|frequencia cardiaca)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{2,3})/,rr:/(?:fr|frequencia respiratoria)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{1,3})/,spo2:/(?:spo2|sato2|saturacao)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{2,3})/,temperature:/(3\d|4[0-3])(?:([.,]\d)|(\s+e\s+meio))?/,consciousness:/glasgow\s*[:=]?\s*(\d+)/};
    const m=patterns[id]?.exec(t);if(!m)return null;
    const value=Number(id==='temperature'?m[1]+(m[2]?m[2].replace(',','.'):(m[3]?'.5':'')):m[1]);
    if(id==='spo2'&&value>100||id==='consciousness'&&(value<3||value>15))return null;
    return value;
  }
  function facts(context={},observations=[]){
    const fields=context.fields||{},out={};
    const sources=sections.map(section=>({section,text:String(fields[section]||'')}));
    const turns=conversation(context.transcript);
    sources.push(...turns.evidence.filter(e=>e.text));
    const spokenHistory=spokenCoreHistory(context.transcript);
    for(const concept of Object.values(concepts)){
      const evidence=turns.evidence.filter(e=>e.concept===concept.id).map(e=>({...e}));
      if(turns.uncertain[concept.id])evidence.push(turns.uncertain[concept.id]);
      for(const source of sources){
        if(universal.has(concept.id)&&source.section!==concept.section)continue;
        // Historical diseases do not become current complaints; explicit old trauma is retained as prior only.
        if(symptomIds.has(concept.id)&&['antecedentes','comorbidades','medicacoes','alergias'].includes(source.section))continue;
        for(const raw of source.text.replace(/[^.!?\n]*\?/g,'').split(/\.(?!\d)|[;!?\n]+|\bmas\b|\bporem\b/i)){
          const text=norm(raw),re=new RegExp(concept.pattern.source,'g');let m;
          if(/\b(?:minha|meu) (?:mae|pai|irma|irmao|esposa|marido|filh[oa])\b|^(?:investigar|considerar|perguntar)\b/.test(text))continue;
          while((m=re.exec(text))){
            const prefix=text.slice(0,m.index),suffix=text.slice(m.index+m[0].length);
            // Negation spans lists, but stops at an affirmative clause.
            const clause=prefix.split(/\b(?:refere|apresenta|relata|tem|teve|com)\b/).pop();
            const unknown=/talvez|acho que|nao lembro|nao entendi|nao (?:sei|sabe|soube)|nao (?:informad|relatad|investigad|avaliad|perguntad)|desconhec/.test(text)||(concept.id==='consciousness'&&/glasgow/.test(m[0])&&measurement(concept.id,m[0])===null);
            let negative=/\b(?:nega|negou|sem|ausencia de|nao tenho|nao tive|nao sinto|nao houve|nunca tive)\b/.test(clause)||/\b(?:nao|nunca)\s+(?:teve|tem|apresenta|sente|possui|refere)\s*$/.test(prefix)||/^\s*(?::|=)?\s*(?:negad[oa]|ausente|nao\b)/.test(suffix)||/^(?:afebril|eupneic)/.test(m[0]);
            if(universal.has(concept.id))negative=/^(?:(?:comorbidades|alergias|medicacoes(?: utilizadas)?)\s*:\s*)?(?:nega\b|negou\b|sem\b|nao\s+(?:tem|possui|usa|toma|faz uso)\b)/.test(text);
            const value=measurement(concept.id,m[0]);
            if(concept.id==='consciousness'&&(/^lucid/.test(m[0])||value===15))negative=!negative;
            const prior=/ha \d+ anos|antecedente|historico de|previ[oa]|no passado/.test(text);
            const resolved=/resolvid|cessou|afebril ha|sem febre ha/.test(text);
            const temporal=prior?'prior':resolved?'resolved':/ha \d+ dias|ontem|em casa|teve/.test(text)?'recent':'current';
            evidence.push({state:unknown?'unknown':negative?'known_absent':'known_present',temporal,section:source.section,quote:raw.trim(),...(value!==null?{value}:{})});
            if(m[0].length===0)break;
          }
        }
      }
      if(universal.has(concept.id))evidence.push(...spokenHistory[concept.id]);
      for(const observation of Array.isArray(observations)?observations:[]){
        if(observation.concept!==concept.id||observation.subject!=='patient'||!['known_present','known_absent','unknown'].includes(observation.state))continue;
        const source=observation.section==='transcript'?String(context.transcript||''):String(fields[observation.section]||'');
        const quote=String(observation.quote||''),t=norm(quote);
        const patientSegments=conversation(source).evidence.filter(e=>e.text).map(e=>e.text);
        if(quote.length<3||!patientSegments.some(text=>norm(text).includes(norm(quote).replace(/[.!;]+$/,'')))||/\?|^(?:investigar|considerar|avaliar)|\b(?:minha|meu) (?:mae|pai|irma|irmao|filh[oa]|esposa|marido)\b/.test(t))continue;
        // Reassuring negatives require explicit negative language; uncertainty never becomes absence.
        if(observation.state==='known_absent'&&(!/\b(?:nao|nega|negou|sem|nunca|ausen|negad)/.test(t)||/nao sei|talvez|acho que|nao lembro/.test(t)))continue;
        if(observation.state!=='unknown'&&/talvez|acho que|nao sei|nao lembro/.test(t))continue;
        if(!evidence.some(e=>norm(e.quote)===t))evidence.push({state:observation.state,temporal:observation.temporal==='prior'&&/no passado|ha .+ anos|historico|previ[oa]/.test(t)?'prior':observation.temporal==='resolved'&&/resolvid|cessou|afebril|nao .+ mais|sem .+ ha/.test(t)?'resolved':observation.temporal==='recent'?'recent':'current',quote,section:observation.section,interpretation:'ai'});
      }
      // Positive past and negative current can coexist. Undated opposite statements require confirmation.
      const correction=evidence.findLastIndex(e=>/retificacao|corrigindo|na verdade|corrijo/.test(norm(e.quote)));
      const relevant=correction>=0?evidence.slice(correction):evidence;
      const active=relevant.filter(e=>!['prior','resolved'].includes(e.temporal));
      const pos=active.filter(e=>e.state==='known_present'),neg=active.filter(e=>e.state==='known_absent');
      const timedResolution=evidence.some(e=>e.temporal==='resolved')||(pos.length&&neg.length&&pos.every(e=>e.temporal==='recent')&&neg.every(e=>/agora|atualmente|hoje|no momento/.test(norm(e.quote))));
      const conflict=!!(pos.length&&neg.length&&!timedResolution);
      const last=timedResolution?(relevant.findLast(e=>e.temporal==='resolved'||e.state==='known_absent')):active.at(-1)||relevant.at(-1);
      out[concept.id]={state:last?.state||'not_asked',temporal:last?.temporal||'unknown',evidence,currentEvidence:last||null,conflict,asked:(universal.has(concept.id)?spokenHistory.asked[concept.id]:turns.asked[concept.id])||null};
    }
    return out;
  }
  // Declarative syndrome packs: independently activated from reported symptoms, never solely from diagnosis.
  const packs=[
    {id:'chest',critical:['dyspnea','syncope','bp'],high:['sweating','radiation','hr','spo2','cvRisk']},
    {id:'abdomen',critical:['peritonism','bp'],high:['vomiting','bleeding','syncope','localization']},
    {id:'headache',critical:['sudden','focal'],high:['fever','meningism','trauma','headachePattern','headacheNausea','photophobia','phonophobia','intensity','character','onset']},
    {id:'back',critical:['saddle','retention','weakness'],high:['fever','trauma']},
    {id:'trauma',critical:[],high:['mechanism','neurovascular','deformity','anticoagulant']},
    {id:'limb',critical:[],high:['trauma','pulses','perfusion','edema']},
    {id:'urinary',critical:[],high:['fever','flank','hematuria']},
    {id:'respiratory',critical:['dyspnea','spo2'],high:['effort','rr','fever','auscultation','respFocal']},
    {id:'diarrhea',critical:[],high:['stoolBlood','hydration','oralTolerance','urineOutput','fever','giVomiting','severeAbdominalPain','onset'],moderate:['stoolFrequency','stoolMucus','stoolPus']},

    {id:'throatPain',critical:['stridor','swallowDifficulty'],high:['fever','exudate','cervicalNodes','dyspnea']},
    {id:'earPain',critical:[],high:['earDischarge','hearingChange','fever','onset']},
    {id:'sinusSymptoms',critical:[],high:['fever','unilateralSinus','onset']},
    {id:'jointPain',critical:[],high:['fever','jointHot','jointRange','weightBearing','jointEffusion','trauma']},
    {id:'constipation',critical:['obstruction'],high:['vomiting','severeAbdominalPain','onset']},
    {id:'upperGI',critical:[],high:['giBleed','vomiting','onset']},
    {id:'giBleed',critical:['hemodynamic','syncope','bp'],high:['hr','anticoagulant','onset']},
    {id:'palpitations',critical:['syncope','bp'],high:['hr','chest','dyspnea','onset']},
    {id:'dizziness',critical:['focal','gaitChange'],high:['syncope','hearingChange','onset']},
    {id:'seizure',critical:['focal','consciousness'],high:['postictal','fever','trauma']},
    {id:'colic',critical:[],high:['fever','hematuria','urinaryRetention','onset']},
    {id:'testicularPain',critical:[],high:['onset','vomiting','trauma']},
    {id:'pelvicPain',critical:[],high:['pregnancy','vaginalBleeding','fever','peritonism']},
    {id:'vaginalBleeding',critical:[],high:['pregnancy','syncope','bp','onset']},
    {id:'rash',critical:[],high:['fever','skinSpread','skinPainDisproportion','onset']},
    {id:'eyePain',critical:[],high:['visionChange','foreignBody','photopsia','onset']},
    {id:'fever',critical:[],high:['temperature','onset','immuno']},
    {id:'neuro',critical:['focal','consciousness','sudden'],high:['glucose','bp','onset']}
  ];
  const category=concept=>concept.section==='sinais_vitais'?'vitals':concept.section==='exame_fisico'?'exam':concept.section==='medicacoes'?'medications':['comorbidades','antecedentes','alergias'].includes(concept.section)?'risk':'history';
  function analyze(context={},ledger={},aiItems=[],observations=[]){
    const known=facts(context,observations),items=new Map(),expected=new Map(),fields=context.fields||{};
    const active=id=>known[id].state==='known_present'&&!['prior','resolved'].includes(known[id].temporal);
    const add=(id,priority='moderate',reason='',redFlag=false)=>{
      const concept=concepts[id],f=known[id];if(!concept)return;
      const priorExpected=expected.get(id);if(!priorExpected||rank[priority]<rank[priorExpected.priority])expected.set(id,{id,priority,redFlag,reason});
      if(!f.conflict&&['known_present','known_absent'].includes(f.state))return;
      const key=f.conflict?'conflict:'+id:id;
      const record=ledger[key];
      // Ledger acknowledgements only suppress the evidence snapshot they actually addressed.
      const evidenceKey=JSON.stringify(f.evidence);
      if(record&&!universal.has(id)&&(record.evidenceKey===evidenceKey||!f.conflict&&record.action==='answer'&&record.documented&&String(fields[record.section]||'').includes(record.documented)))return;
      const item={id:key,concept:id,category:f.conflict?'contradiction':redFlag?'red_flags':category(concept),priority:f.conflict&&rank[priority]>1?'high':priority,question:f.conflict?`Há informações conflitantes sobre ${concept.label.toLowerCase()}. Confirmar.`:(concept.type==='boolean'?`Investigar ${concept.label.toLowerCase()}.`:`Esclarecer / registrar ${concept.label.toLowerCase()}.`),reason,targetSection:concept.section,answerType:f.conflict?'text':concept.type,answered:false,status:f.conflict||f.state==='unknown'?'confirm':f.asked?'asked':'to_ask',evidence:f.evidence,askedEvidence:f.asked,evidenceKey,source:'rule',redFlag};
      if(!items.has(key)||rank[item.priority]<rank[items.get(key).priority])items.set(key,item);
    };
    // Universal clinical background is tracked in its own pane, not promoted
    // above syndrome-specific problems or made a compulsory 'next question'.
    add('comorbidities','low','Histórico para contextualizar riscos e prescrição.');
    add('allergies','low','Checar antes de prescrever; silêncio não é negativa de alergia.');
    add('medicines','low','Revisar medicações e interações pertinentes à prescrição.');
    const preliminary=norm([fields.queixa_principal,fields.hda,context.transcript].filter(Boolean).join(' '));
    const hypothesis=norm([fields.hipotese_diagnostica,fields.cid,fields.cid10,fields.cid_principal,fields.cid_codigo,context.cid,context.cid10].filter(Boolean).join(' '));
    // A provisional ICD-10 is a routing hint, not proof of any clinical finding.
    const giContext=active('diarrhea')||/\b(?:a09|gastroenterite|diarreia|enterocolite)\b/.test(hypothesis);
    const headacheContext=active('headache')||/\b(?:r51|g43|g44|cefaleia|enxaqueca|migranea)\b/.test(hypothesis);
    const respiratoryContext=active('respiratory')||/\b(?:j0[0-6]|j20|j40|j45|j46|j18|tosse|broncospasmo|asma|pneumonia|infeccao respiratoria)\b/.test(hypothesis);
    const activated=packs.filter(p=>p.id==='diarrhea'?giContext:p.id==='headache'?headacheContext:p.id==='respiratory'?respiratoryContext:active(p.id));
    // No syndrome-specific rule is activated solely from a code if the
    // underlying diagnosis is not clearly attributed to the current visit.
    const giReason={
      stoolBlood:'Sangue nas fezes pode indicar investigação etiológica; isoladamente não justifica antibiótico.',
      hydration:'Grau de hidratação diferencia reidratação oral, venosa e observação.',
      oralTolerance:'A capacidade de ingerir líquidos modifica a escolha da reidratação.',
      urineOutput:'Diurese auxilia a avaliar perdas e possível hipovolemia.',
      fever:'Febre associada a diarreia pode justificar investigação conforme gravidade e contexto.',
      giVomiting:'Vômitos persistentes podem impedir hidratação oral.',
      severeAbdominalPain:'Dor intensa/localizada exige reconsiderar o diagnóstico diferencial.',
      stoolFrequency:'Frequência das evacuações auxilia a estimar perdas e evolução.',
      stoolMucus:'Muco pode orientar investigação com outros sinais; sozinho não prova infecção bacteriana.',
      stoolPus:'Secreção purulenta relatada exige caracterização e diferencial.',
      onset:'Duração ajuda a distinguir doença aguda e persistente.'
    };
    const headacheReason={
      sudden:'Início súbito com pico imediato muda a investigação de cefaleia secundária.',
      focal:'Alteração focal aumenta a necessidade de avaliar etiologia secundária.',
      fever:'Febre associada é contextual, sobretudo com meningismo.',
      meningism:'Sinais meníngeos podem indicar condição secundária grave.',
      trauma:'Trauma recente modifica o diagnóstico diferencial.',
      headachePattern:'Mudança significativa do padrão exige investigação contextual.',
      photophobia:'Sintoma associado ajuda a caracterizar cefaleia primária.',
      phonophobia:'Sintoma associado ajuda a caracterizar cefaleia primária.',
      headacheNausea:'Náusea e vômitos contribuem para a caracterização.',
      intensity:'Caracterizar intensidade e evolução da dor.',
      character:'Caracterizar dor e diferenciais.',
      onset:'Tempo de início e duração são relevantes para risco.'
    };
    for(const pack of activated)for(const priority of ['critical','high','moderate']){
      for(const id of pack[priority]||[]){
        const reason=pack.id==='diarrhea'?giReason[id]:pack.id==='headache'?headacheReason[id]:
          'Investigar diferencial e sinais de gravidade pertinentes à síndrome '+concepts[pack.id].label.toLowerCase()+'.';
        add(id,priority,reason||'Avaliação dirigida a '+concepts[pack.id].label.toLowerCase()+'.',priority==='critical');
      }
    }
    // A broncho-obstructive presentation needs severity checks and differential.
    // Mental-status change is an alert only if documented, never a routine question.
    const bronchospasm=respiratoryContext&&(/\b(?:chiad\w*|sibil\w*|broncoespasmo|crise asmatica)\b/.test(preliminary)||/\b(?:j45|j46|asma|broncoespasmo)\b/.test(hypothesis));
    if(bronchospasm)for(const id of ['wheeze','speechLimit','effort','rr','spo2'])
      add(id,id==='spo2'||id==='speechLimit'?'high':'moderate','Avaliar gravidade do broncoespasmo e limitação funcional.');
    if(respiratoryContext&&/\b(?:pneumonia|j18)\b/.test(hypothesis))
      for(const id of ['pleuriticPain','respFocal','rr','spo2'])
        add(id,'high','Investigar sinais respiratórios pertinentes à possibilidade de pneumonia.');
    const currentText=norm([fields.queixa_principal,fields.hda,context.transcript].filter(Boolean).join(' '));
    if(active('trauma')&&/tornozelo|pe/.test(currentText))for(const id of ['weightThen','fourSteps','malleoli','midfoot'])add(id,'high','Caracteriza o trauma de tornozelo/pé; não aplica automaticamente uma regra de imagem.');
    if(active('trauma')&&/crani\w*|cabeca|tce/.test(currentText))for(const id of ['consciousness','focal'])add(id,'critical','Possível trauma craniano exige esclarecimento contextual.',true);
    if((active('trauma')||active('limb'))&&/\b(?:joelho|tornozelo|perna|braco|punho|cotovelo|ombro|membro)\b/.test(currentText)){
      for(const id of ['jointRange','weightBearing'])add(id,'moderate','Limitação funcional influencia avaliação de lesão osteomuscular.');
      for(const id of ['neurovascular','deformity','wound'])add(id,'high','Avaliar sinais de lesão grave no segmento acometido, conforme mecanismo e exame.');
    }
    if(active('back')&&(/\b(?:febre|cancer|imunossupressao|trauma|uso de drogas)\b/.test(currentText)))
      add('backRedSystemic','high','Investigar causas específicas de lombalgia com fatores de risco.');
    if(active('limb')&&active('edema')){add('dvtRisk','high','Esclarecer risco tromboembólico no contexto do edema.');if(/unilateral|esquerd|direit/.test(currentText)){add('dvt','high','Edema unilateral pode exigir investigação de causas vasculares.');const d=items.get('dvt');if(d){d.category='differential';d.question='Considerar TVP no diferencial; não representa diagnóstico confirmado.';}}}
    const patient=demographics(context),age=Number(patient.age);
    if(activated.some(p=>['abdomen','headache','urinary'].includes(p.id))&&patient.sex==='feminino'&&(!age||age>=10&&age<=55))add('pregnancy','high','Gestação ou puerpério podem modificar a avaliação.');
    if((active('chest')||active('abdomen')||active('headache')||active('back')||active('limb'))&&/\bdor\b|cefaleia|lombalgia/.test(currentText)){
      ['localization','onset','intensity','character'].forEach(id=>add(id,id==='localization'?'high':'moderate','Caracterização útil da dor atual.'));
      if(!active('trauma')&&!headacheContext)['radiation','aggravation','relief','evolution'].forEach(id=>add(id,'low','Complementar a caracterização da dor conforme pertinência.'));
    }
    // A reported but unmeasured fever is known information, not a missing temperature question.
    if(active('fever')&&/nao aferi\w*|nao mediu|nao mensurad\w*/.test(currentText))items.delete('temperature');
    for(const [id,f] of Object.entries(known))if(f.conflict)add(id,'high','Confirmar cronologia e conteúdo antes de manter afirmações incompatíveis.');
    const post=!!fields.hipotese_diagnostica;
    // Universal checks above do not depend on a recorded hypothesis.
    // AI is additive: it cannot remove/downgrade deterministic gaps or create factual findings.
    for(const raw of Array.isArray(aiItems)?aiItems.slice(0,24):[]){
      if(!raw||typeof raw!=='object'||!concepts[raw.concept])continue;
      const evidence=String(raw.contextEvidence||'');
      if(evidence.length<5||!norm(sections.map(s=>fields[s]||'').join(' ')+' '+(context.transcript||'')).includes(norm(evidence)))continue;
      const id=raw.concept;if(known[id].state!=='not_asked'||ledger[id])continue;
      // A model cannot surface a generic out-of-syndrome item as mandatory.
      if(!expected.has(id))continue;
      // Render our question and destination; never inject a model assertion into the record.
      const approved=expected.get(id);
      add(id,approved.priority,'Sugestão contextual sujeita às regras clínicas; confirmar pertinência.',approved.redFlag);
    }
    // Actionable discrimination first, not alphabetical sorting or checklist length.
    const decisionOrder=giContext?['stoolBlood','hydration','oralTolerance','urineOutput','fever','severeAbdominalPain','giVomiting','onset','stoolFrequency','stoolMucus','stoolPus']:
      headacheContext?['sudden','focal','fever','meningism','headachePattern','trauma','onset','intensity','character','headacheNausea','photophobia','phonophobia']:
      respiratoryContext?['dyspnea','spo2','effort','rr','speechLimit','fever','auscultation','respFocal','wheeze','pleuriticPain']:
      active('jointPain')?['fever','jointHot','jointRange','weightBearing','jointEffusion','trauma']:
      active('back')?['saddle','retention','weakness','fever','trauma','radicular']:
      active('throatPain')?['stridor','swallowDifficulty','fever','exudate','cervicalNodes']:
      active('dizziness')?['focal','gaitChange','syncope','onset']:
      active('giBleed')?['hemodynamic','syncope','bp','hr','anticoagulant']:
      active('eyePain')?['visionChange','foreignBody','photopsia']:[];
    const decisionRank=id=>{const i=decisionOrder.indexOf(id);return i<0?999:i};
    const list=[...items.values()].sort((a,b)=>rank[a.priority]-rank[b.priority]||
      Number(universal.has(a.concept))-Number(universal.has(b.concept))||
      decisionRank(a.concept)-decisionRank(b.concept)||a.id.localeCompare(b.id));
    const critical=list.filter(i=>i.priority==='critical');
    const unresolvedSafety=[...new Set(activated.flatMap(p=>p.critical))].filter(id=>known[id].state==='unknown'||ledger[id]&&known[id].state==='not_asked');
    const alerts=[];
    const flagIds=new Set(activated.flatMap(p=>[...p.critical,...p.high.filter(id=>['meningism','bleeding','vomiting','hemoptysis','effort','deformity'].includes(id))]));
    const related=id=>list.filter(i=>activated.some(p=>[p.id,...p.critical,...p.high].includes(id)&&[...p.critical,...p.high].includes(i.concept))).map(i=>i.id);
    const finding=(id,reason,source)=>alerts.push({id:'finding:'+id,concept:id,priority:'critical',question:`Reavaliar o achado documentado: ${concepts[id].label.toLowerCase()}.`,evidence:[known[id].currentEvidence],reason,related:related(id),kind:'documented_finding',...(source?{sourceUrl:source}:{})});
    for(const id of flagIds)if(active(id)&&!known[id].conflict&&(concepts[id].type==='boolean'||id==='consciousness'))finding(id,expected.get(id)?.reason||'Achado relevante no contexto atual; requer avaliação médica.');
    // Abnormal mental state is an important documented finding in any syndrome.
    if(active('consciousness')&&!known.consciousness.conflict&&!flagIds.has('consciousness'))
      finding('consciousness','Alteração do estado mental documentada: reavaliar gravidade e causas sistêmicas.');
    if(giContext&&active('stoolBlood')&&!known.stoolBlood.conflict)
      alerts.push({id:'finding:stoolBlood',concept:'stoolBlood',priority:'high',
        question:'Diarreia com sangue: investigar etiologias inflamatórias e avaliar STEC conforme contexto.',
        evidence:[known.stoolBlood.currentEvidence],reason:giReason.stoolBlood,
        related:list.filter(i=>['fever','severeAbdominalPain','hydration'].includes(i.concept)).map(i=>i.id),kind:'documented_finding'});
    // Individual extreme measurements prompt review; this is not a NEWS2 score or a destination rule.
    // Adult thresholds are not applied to children, unknown age, pregnancy or documented hypercapnia targets.
    const adult=age>=16&&!active('pregnancy'),physiology={bp:v=>v<=90||v>=220,hr:v=>v<=40||v>=131,rr:v=>v<=8||v>=25,spo2:v=>v<=91,temperature:v=>v<=35};
    for(const [id,abnormal] of Object.entries(physiology)){
      const f=known[id],v=f.currentEvidence?.value;
      if(!adult||!active(id)||f.conflict||v==null||!abnormal(v))continue;
      const respiratoryTarget=id==='spo2'&&/hipercapni|meta.{0,20}(?:88|92)|alvo.{0,20}(?:88|92)/.test(norm(sections.map(s=>fields[s]||'').join(' ')+' '+(context.transcript||'')));
      if(respiratoryTarget)continue;
      finding(id,'Medida extrema documentada em adulto. Confirmar medida, contexto e evolução; requer avaliação médica.','https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/');
    }
    const clarified=[...expected.values()].filter(i=>!known[i.id].conflict&&['known_present','known_absent'].includes(known[i.id].state)).map(i=>({...i,label:concepts[i.id].label,status:'clarified',...known[i.id]}));
    return {version:1,demographics:patient,clarified,confirm:list.filter(i=>i.status==='confirm'),focus:activated.map(p=>concepts[p.id].label),stage:post?'post_hypothesis':'pre_hypothesis',items:list,facts:known,alerts,criticalCount:critical.length,unresolvedSafety,chief_complaint:fields.queixa_principal||'',covered:Object.entries(known).filter(([,f])=>f.state!=='not_asked').map(([id])=>concepts[id].label),missing:list.map(i=>i.question),questions:list.map(i=>i.question),dispositionCaution:critical.length>0||alerts.length>0||unresolvedSafety.length>0,hasContext:currentText.length>0||hypothesis.length>0};
  }
  function answer(context,ledger,item,value,action='answer'){
    if(!item||!concepts[item.concept])throw new Error('Sugestão inválida.');
    value=String(value??'').trim();if(!value)throw new Error('Informe a resposta.');
    const fields={...(context.fields||{})},next={...ledger},concept=concepts[item.concept];
    const record={action,value,section:item.targetSection,evidenceKey:item.evidenceKey,at:new Date().toISOString()};
    if(action==='answer'){
      let statement=concept.type==='boolean'&&/^sim$/i.test(value)?`${concept.label}: presente.`:concept.type==='boolean'&&/^(?:nao|não)$/i.test(value)?`${concept.label}: negado.`:`${concept.label}: ${value.replace(/[.]+$/,'')}.`;
      // Keep historical surgeries in history, even when the triggering item was a history question.
      if(/cirurg|operad|procedimento/i.test(value)&&/h[aá] \d+ anos|em (?:19|20)\d{2}/i.test(value))record.section='antecedentes';
      let previous=String(fields[record.section]||'').trim();
      if(item.category==='contradiction'){
        // Only explicitly confirmed resolution replaces conflicting sentences; retain old evidence in ledger.
        const f=facts(context)[item.concept];record.superseded=f.evidence;
        statement='Retificação sobre '+statement;
      }
      if(!norm(previous).includes(norm(statement))){
        previous=previous.replace(/\s*sem demais queixas\.?\s*$/i,'').trim();
        fields[record.section]=[previous,statement,record.section==='hda'?'Sem demais queixas.':''].filter(Boolean).join(' ');
      }
      record.documented=statement;
    }
    next[item.id]=record;
    return {context:{...context,fields},ledger:next};
  }
  return {analyze,facts,answer,conversation,demographics,concepts,packs,norm,rank};
});
