# NEXA Radar — segurança, evidências e histórico clínico obrigatório

## Arquitetura verificada (24/10/2026)
- Regras locais: `nexa-radar-engine.js` reconhece achados transcritos e estruturados, reúne pacotes sindrômicos, gera perguntas e identifica evidência e contradições. Priorização por `critical/high/moderate/low`.
- Inteligência remota: `supabase/functions/realtime-radar/index.ts` utiliza catálogo fechado, extratos literais de evidência e validação. A IA pode acrescentar lacunas, sem reduzir as prioridades das regras locais e sem gravar diagnóstico.
- A referência NEWS2 é citada somente no controle local de determinados sinais vitais adultos. Isso NÃO significa validação sistemática do catálogo de perguntas inteiro contra diretrizes.
- Regras de tendência de disposição/alta baseadas em cobertura documental exigem revisão clínica separada; porcentagem de cobertura não pode ser tratada como segurança de alta.

## Comportamento acrescentado nesta PR
1. Comorbidades, alergias e uso contínuo de medicamentos entram como pendências mesmo sem síndrome ativada.
2. Documentação afirmativa ou negativa explícita remove apenas o item correspondente. Não informado/não relatado/inconclusivo mantém item pendente.
3. Os controles de "Já avaliado" e "Dispensar" não servem para remover uma pendência essencial sem documentar resposta.
4. No encerramento, esses três tópicos e todos os itens de segurança relevantes continuam visíveis sem corte arbitrário de seis itens.
5. Posologia de uso contínuo por período se documenta no formato manhã–tarde–noite, 1-0-1, 0-1-0 etc., **somente** quando quantidade e períodos foram informados. A concentração e unidade original são preservadas. Sem horários claros não se transforma 2x/dia em 1-0-1.

## Proposta clínica futura — ainda não implementada
Cada pergunta deve guardar origem, versão/data e grau de evidência, população aplicável (adulto/criança/gestação), contexto disparador, hipótese de exclusão, consequência da resposta e motivo da prioridade:
- **Crítica:** ameaça tempo-dependente ou marcador de deterioração; priorizar avaliação imediata, nunca fazer diagnóstico automático.
- **Essencial:** modifica segurança da conduta ou investigação; inclui gestação quando pertinente, anticoagulação, alergias e comorbidades.
- **Importante:** discrimina hipóteses diagnósticas mais prováveis e hipóteses que não podem ser perdidas.
- **Complementar:** agrega detalhe histórico sem mesmo peso para segurança imediata.
Critérios exigem curadoria médica, cenários sintéticos, teste retrospectivo desidentificado e observação de falsos negativos antes de produção.

## Fontes candidatas à curadoria
- AHRQ (segurança diagnóstica): https://www.ahrq.gov/diagnostic-safety/resources/issue-briefs/nurse-role-dxsafety-apa.html
- Conitec / Ministério da Saúde, PCDT: https://www.gov.br/conitec/pt-br/assuntos/avaliacao-de-tecnologias-em-saude/protocolos-clinicos-e-diretrizes-terapeuticas/pcdt
- Reconciliação medicamentosa: https://www.ncbi.nlm.nih.gov/books/NBK2648/
- NICE Medicines Optimisation: https://www.nice.org.uk/guidance/ng5

Essas fontes são propostas de revisão, não evidência de que cada regra atual esteja clinicamente validada contra elas.
