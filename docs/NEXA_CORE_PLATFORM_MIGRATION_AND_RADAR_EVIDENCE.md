# NEXA Core — arquitetura de plataforma e Radar fundamentado em evidências
Versão da proposta: 2026-10-25 (planejamento; não é certificação clínica)

## Resultado entregue nesta branch
- Biblioteca de fontes `nexa-radar-evidence-library.mjs` compartilhada pelos dois provedores.
- Fontes públicas indexadas com origem, URL, identificação e sinalização de revisão clínica pendente.
- Primeiros candidatos de contexto: dor torácica, sintomas focais em adulto, dispneia e febre pediátrica quando a idade está explicitamente indicada.
- O índice fornece `candidate_playbooks` e `focus_concepts` sem nomes nem transcrição, e **não** gera sinais clínicos confirmados, recomendações terapêuticas ou pontuações de alta.
- NEXA Core mantém o contrato HTTP `nexa-core-radar-v1`, recebendo opcionalmente `evidence_context` da versão `nexa-radar-evidence-v1` sem quebrar a resposta anterior.
- O provedor atual usa a **mesma seleção de fontes** nas instruções; isso é contexto de recuperação bibliográfica, não conteúdo de diretriz recuperado nem capacidade de citar uma recomendação validada.
- Conflitos, anotação clínica, autoria da decisão médica e dados de auditoria permanecem sob os mecanismos atuais.

## Fluxo editorial v1 — implementado nesta PR
O módulo `supabase/functions/_shared/nexa-radar-editorial.mjs` permite receber **candidatos estruturados de um modelo de IA** sem convertê-los em orientação clínica automaticamente:

1. Um gerador (IA humana supervisionada ou outro provedor) devolve JSON contendo identificador, playbook, conceito já conhecido, pergunta, justificativa, relevância para a decisão, prioridade proposta, público-alvo e proveniência (fonte, versão/ano, seção localizável e data da conferência).
2. A rotina `proposeRadarEditorialQuestion` rejeita fonte desconhecida ou licenciada não integrada, URL substituída, conceito fora do catálogo, população incompatível, dados pessoais evidentes, campos inesperados, falta de proveniência e autodeclaração de aprovação.
3. Um editor pode importar **somente rascunhos**, offline, usando `node scripts/nexa-radar-editorial-draft.mjs draft editorial/radar/drafts/chest_dyspnea_2026.json`. O exemplo foi derivado da linha de cuidado pública do Ministério da Saúde para dor torácica, mas permanece sem aprovação clínica.
4. Duas revisões independentes (médico e responsável pela segurança clínica) precisam verificar fonte e pergunta; a cópia revisada do conteúdo é fixada em cada parecer. Uma mudança posterior na pergunta, no risco proposto ou na referência invalida os pareceres anteriores.
5. O compilador só admite conteúdo revisado e com fontes ainda constantes do catálogo. A versão inicial do inventário `nexa-radar-editorial-published.mjs` está **vazia**. Consequentemente, nenhuma pergunta editorial inédita é apresentada hoje como clinicamente aprovada.
6. A API atual e o futuro NEXA Core recebem o mesmo campo `reviewed_questions` quando houver conteúdo aprovado, no contrato de evidências. `candidate_playbooks` continuam sendo somente candidatos bibliográficos, não achados clínicos.

### Limite importante de confiança
`appendRadarEditorialReview` é uma rotina pura de montagem de revisões, **não autentica pessoas nem assina documentos**. A etapa administrativa futura deve exigir login, autorizações por função, controle de conflito de interesses, trilha de auditoria imutável, aprovação por duas identidades verificadas e assinatura/versão de publicação gerenciadas no servidor. Os testes com nomes fictícios verificam *formato e bloqueios lógicos*, não substituem essas garantias. **Não adicionar entradas à lista publicada até a implantação e validação dos controles reais e a revisão clínica das perguntas.**

### Como a IA ajudará sem cadastrar milhares de patologias manualmente
A entrada mais escalável será um processo editorial assistido por IA: converter protocolos autorizados e versionados em propostas com critério de ativação, diagnóstico a não perder, pergunta, racional, população/contraindicações e a consequência interpretativa de cada resposta. A biblioteca relaciona essas propostas a **apresentações sindrômicas**, não a uma hipótese diagnóstica já definida. O modelo poderá gerar candidatos, mas regras críticas, conceito clínico e corpus de fontes necessitam homologação humana antes da liberação. O motor de entrevista dinâmico e a expansão do catálogo além dos conceitos atuais ainda são uma etapa seguinte, não parte desta PR.

## Separação de camadas — destino final
```text
PWA NEXA (consulta, gravação, revisão, auditoria)
       |
NEXA API Gateway / autenticação e autorização (tenant, médico, encounter)
       |
Motor de capacidades (consultation.processing, realtime.call, realtime.radar,
                       audit.submit, audit.backfill e futuras capacidades)
       |                       |
  Motor determinístico     Adaptadores de IA intercambiáveis
  e segurança clínica         |                 |
       |                   OpenAI legado     NEXA Core próprio
       |                                         |
  Biblioteca de evidências versionada <- recuperação licenciada/autorizada
       |
Governança e avaliação médica (auditoria, rótulos revisados, benchmark, rollback)
```

O repositório já contém `supabase/functions/_shared/nexa-ai-capability.mjs`. A capacidade `realtime.radar` é a primeira com adaptador `nexa-core` funcional em contrato, enquanto `consultation.processing`, `realtime.call`, `audit.submit` e `audit.backfill` ainda NÃO estão migradas para o Core. **Não adicionar `nexa-core` a essas capacidades até existir implementação independente testada**, para evitar falsa indicação de cobertura.

### Roteiro por capacidade
1. Radar: autenticação server-to-server, mesma biblioteca de conceitos, evidência e observações verificadas. Evoluir de baseline determinístico para motor próprio clinicamente validado.
2. Transcrição e múltiplos interlocutores: gateway de ASR/diarização dedicado, consentimento e estado de locutor, sem alterar a HDA por inferência.
3. Estruturação de consulta e documentos: contrato neutro de provedor, validação de campos, cronologia da HDA, snapshot durável e revisão do médico.
4. Auditoria e aprendizagem: rótulos médicos explícitos, não usar dispensas como verdade clínica, isolamento por profissional/organização e deduplicação.
5. Publicação gradual de capacidades: feature flags server-side, `shadow mode` somente com dados sintéticos ou apropriados, métricas técnicas desidentificadas e rollback seguro. Nenhum fallback silencioso entre provedores.
6. Só ao final substituir o gateway dependente de terceiros por infraestrutura NEXA Core de ponta a ponta; serviços de prontuário e armazenamento não devem estar acoplados a uma escolha de LLM.

## Política de fontes e licenciamento
Preferência editorial: Ministério da Saúde/Conitec (linhas de cuidado e PCDT), sociedades brasileiras de especialidade e AMB; NICE e AHRQ complementam quando pertinentes. UpToDate só poderá ser integrado com credencial/licença e autorização correspondente. Nenhum trecho de obra licenciada está embutido no repositório.

**A indexação de links não equivale a ingestão de diretrizes nem a revisão das recomendações.** Para que uma pergunta faça referência a uma diretriz:
- registrar título, emissor, ano/versão, URL ou ID documental, status e licença;
- identificar recorte clínico, população, contraindicações, tipo de evidência e limites de aplicabilidade;
- documentar qual objetivo de investigação/pergunta foi extraído, com revisão humana e data de validade;
- versionar o pacote assinado, não aceitar alterações automáticas sem validação;
- manter trilha de justificativa e resultado, sem armazenar dado identificável no índice de conhecimento.

## Radar Clinical Reasoning 2.0 — circuito desejado
1. Extrair **fatos clínicos explícitos** com origem/locutor/tempo/confiança; separar não informado, negado, presente e contraditório. Distinguir pergunta do médico de resposta do paciente.
2. A partir das apresentações e fatos, selecionar pacotes candidatos, nunca diagnósticos fechados.
3. Recuperar referências validadas para faixa etária e contexto. Se não houver fonte validada, declarar lacuna bibliográfica em vez de inventar citação.
4. Gerar candidatos de pergunta pela IA, com justificativa de relevância para segurança, discriminação diagnóstica e consequência clínica. Obrigatoriedade de alergias, comorbidades e medicação contínua vem do núcleo determinístico.
5. Aplicar barramento de segurança determinístico (prioridade crítica, evidências literais, dados inconclusivos, impossibilidade de marcar negativo sem resposta).
6. Selecionar pergunta principal e alternativas, evitando repetição e fadiga; permitir revisão/supressão justificadas por médico.
7. Auditar *falsos negativos* (alertas ignorados), pertinência, repetições, falsos positivos, latência e divergências, com casos sintéticos e amostras médicas aprovadas.

## Critérios de homologação — não confundir UX com validação clínica
- Casos de alto risco, apresentações atípicas, pediatria, gestação, idoso, múltiplas comorbidades e uso de anticoagulantes.
- Testar questionamentos isolados, informação negada, cronologia, respostas curtas, interlocutores múltiplos, ruído e erros de transcrição.
- Falha de rede/IA deve manter perguntas determinísticas e dizer que avaliação remota está indisponível.
- Medir precisão e sensibilidade para perguntas relevantes **por cenário de referência**, sem usar o percentual de preenchimento como métrica de segurança para alta.
- Requer validação médico-clínica formal, checagem de licenças, privacidade (LGPD), finalidade de uso e análise de enquadramento Anvisa antes de comercialização.

## Catálogos públicos indexados
- MS — Dor torácica (UPA): https://linhasdecuidado.saude.gov.br/portal/dor-toracica/unidade-de-pronto-atendimento/avaliacao-conduta/
- MS — Suspeita de IAM: https://linhasdecuidado.saude.gov.br/portal/infarto-agudo-do-miocardio/unidade-de-atencao-primaria/suspeita-iam/
- Sociedade Brasileira de Cardiologia — Diretriz de atendimento à dor torácica na emergência (2025): https://abccardiol.org/article/diretriz-brasileira-de-atendimento-a-dor-toracica-na-unidade-de-emergencia-2025/
- Sociedade Brasileira de AVC — Diretrizes atualizadas (outubro/2026): https://avc.org.br/membros-e-profissionais/diretrizes-avc/
- MS/Conitec — PCDT AVC isquêmico agudo: https://www.gov.br/saude/pt-br/assuntos/pcdt/a/acidente-vascular-cerebral-isquemico-agudo/view
- AMB/Sociedades: https://diretrizes.amb.org.br/
- SBP — Emergência: https://www.sbp.com.br/departamentos/emergencia/documentos-cientificos/
- SBP — Febre pediátrica: https://www.sbp.com.br/departamentos/pediatria-ambulatorial/documentos-cientificos/
- NICE: https://www.nice.org.uk/guidance
- AHRQ: https://www.ahrq.gov/diagnostic-safety/index.html
- UpToDate — solicitação de autorização: https://www.wolterskluwer.com/en/solutions/uptodate/policies-legal/permission-to-reproduce
