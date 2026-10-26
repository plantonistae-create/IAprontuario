# NEXA Radar — Investigação por Síndrome e Impacto na Decisão (v2)
Atualizado em 26/10/2026. **Módulo clínico assistivo; não é protocolo diagnóstico aprovado para decisões automáticas.**

## Regra essencial
O Radar não deve impor um checklist genérico em todos os encontros. Deve reconhecer a queixa atual na fala transcrita e no documento, usar a hipótese/CID como **pista de roteamento**, analisar o que foi efetivamente informado e sugerir apenas o que possa refinar diferenciais, gravidade, exames ou reavaliação. Nunca transformar informação ausente em achado negativo.

**Prioridade de implantação:** respiratório → gastrointestinal → osteomuscular, mas com cobertura transversal de outras queixas frequentes.

## Síndromes presentes

| Grupo | Presentações iniciais orientadas | Perguntas de impacto (exemplos, não lista obrigatória universal) |
| --- | --- | --- |
| Respiratório | Tosse/IVAS; suspeita pneumonia; broncoespasmo/asma | Dispneia, oximetria, FR, esforço, ausculta focal, limitação de fala |
| Gastrointestinal | Diarreia A09; dor abdominal; dispepsia; constipação; hemorragia GI | Hidratação, diurese, tolerância VO, sangue nas fezes, vômitos, peritonismo, sinais de sangramento/obstrução |
| Osteomuscular | Trauma de membro; entorse; dor articular/joelho/ombro; lombalgia | Mecanismo, capacidade de apoio, amplitude, pulso/perfusão/sensibilidade distais, deformidade, pele, sinais articulares inflamatórios, sinais de cauda equina |
| ENT / vias aéreas | Odinofagia; otalgia; rinossinusite | Dificuldade de deglutição, estridor, febre, exsudato, otorreia, audição, evolução |
| Cardiovascular | Dor torácica; palpitações; edema unilateral | Dispneia, síncope, pressão, FC, fatores de risco e tromboembolismo conforme contexto |
| Neurológico | Cefaleia; vertigem; convulsão | Início súbito, déficit focal, marcha/ataxia, sinais meníngeos, recuperação pós-ictal; mudança mental apenas quando relevante |
| Geniturinário / ginecológico | Disúria; cólica renal; dor pélvica; sangramento vaginal | Febre, dor em flancos, retenção, hematúria, possibilidade de gravidez, instabilidade |
| Dermatológico / ocular | Exantema, urticária; olho vermelho/doloroso | Progressão, febre, dor desproporcional, visão aguda, exposição química/trauma |

Estas rotas são regras introdutórias para classificar perguntas; não pretendem cobrir toda a variedade de diagnósticos dentro de cada apresentação nem substituir abordagem sindrômica completa de profissional de saúde.

## Escalonamento condicionado, não universal
- Alteração de consciência observada gera alerta **mesmo em diarreia comum**; não gerar automaticamente Glasgow ou estado neurológico como pendência de cada A09, cefaleia ou IVAS.
- Em trauma craniano, perguntas neurológicas e anticoagulantes seguem pertinentes; em lesão de membro, focalizar neurovascular distal, mecanismo e função.
- Sintomas negados explicitamente não reaparecem como pendência. Não inferir negativas do silêncio, de hipóteses ou de respostas incertas.
- Perguntas de histórico (alergias, comorbidades, medicamentos) ficam disponíveis, mas separadas da fila imediata. **Alergias devem continuar a ser revisadas antes de qualquer prescrição**, não confundidas com dispensa clínica.
- O Radar não decide exames, antibiótico, encaminhamento, internação ou alta.
- Nenhum escore (Ottawa, Centor, Wells, NEWS2, HEART etc.) é aplicado automaticamente sem população elegível, critérios completos e validação própria.

## Auditoria e aprendizagem
- A captura atual mantém perguntas geradas, conceito, prioridade, estado e justificativa, quando disponível e desidentificada, inclusive histórico anterior de perguntas ainda não pendentes.
- No painel de auditoria, o médico compara perguntas com **HDA estruturada, EF, sinais vitais, hipótese e conduta desidentificados**, classificando cada pergunta como pertinente, desnecessária ou dependente do contexto. Pode registrar pergunta que faltou com justificativa.
- O painel não apresenta áudio nem transcrição bruta: esses dados não são persistidos no dataset por padrão. HDA estruturada não deve ser representada como fala literal do paciente.
- Feedback exige revisão humana autenticada e rastreável; uma dispensa operacional de pergunta não equivale a rótulo clínico de treinamento.
- O NEXA Core não deve ser treinado automaticamente com dados assistenciais identificáveis ou não revisados.

## Referências para revisão editorial
- [IDSA, infectious diarrhea 2017](https://www.idsociety.org/practice-guideline/infectious-diarrhea)
- [GINA, Global Strategy Report 2026](https://ginasthma.org/wp-content/uploads/2026/05/GINA-2026-Strategy-Report-WMS.pdf)
- [NICE NG120, acute cough](https://www.nice.org.uk/guidance/ng120/chapter/Recommendations)
- [NICE NG250, pneumonia](https://www.nice.org.uk/guidance/ng250/chapter/recommendations)
- [NICE NG59, low back pain](https://www.nice.org.uk/guidance/ng59/chapter/recommendations)
- [NICE NG84, sore throat](https://www.nice.org.uk/guidance/ng84/chapter/Recommendations)
- [NICE NG109, UTI](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations)
- [ACEP 2023, mild TBI](https://pmc.ncbi.nlm.nih.gov/articles/PMC10617828/)
- [ACEP 2019, acute headache clinical policy](https://www.acep.org/siteassets/sites/acep/media/clinical-policies/cp-headache.pdf)

**Pré-liberação:** testes unitários sintéticos e regressão multibrowser; validação clínica prospectiva por médicos, sobretudo em crianças, gestantes, idosos frágeis e pacientes críticos. Aprovação das diretrizes de cada síndrome deve ocorrer separadamente antes de alegar validade como protocolo formal.
