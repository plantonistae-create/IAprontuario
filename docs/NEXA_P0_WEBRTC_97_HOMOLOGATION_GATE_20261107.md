# NEXA P0 WebRTC 9.7 — Gate consolidado de homologação isolada (PREPARAÇÃO; NO-GO)

**Estado:** DOCUMENTAL / NÃO EXECUTADO. **Data:** 2026-11-07.
**Repositório:** \`plantonistae-create/IAprontuario\`.
**Referência de origem:** PR #133 Draft, HEAD anterior a este documento \`ed53215208b27d32882fbb4befc5e75080eeda6f\`, base \`main cb95e0e19dcc9d81947e791ff5d10537104d0686\`.
**CI aprovada da implementação:** [#42355477729](https://github.com/plantonistae-create/IAprontuario/actions/runs/42355477729) (não equivale a ensaio real com microfone ou upstream). Um commit deste documento abre uma nova CI; não inferir sua conclusão.
**Produção hospedada:** Supabase \`realtime-call\` v6, \`verify_jwt=true\`, hash do bundle \`1675c95f6b1a25569c6af86e5c461f05fd475ee0d8a759439631d2d56221e005\`.
**Cuidado:** a função de staging observada era v5, e a versão do repositório diverge da v6 hospedada. Nenhuma das duas substitui a v6 preservada.

## 0. Política de autorização (bloqueio antes de qualquer execução)

A autorização P0 9.7 abrange **somente elaborar e versionar este roteiro**. Não autoriza execução com autenticação real, gravação em dispositivo, chamada OpenAI, criação/modificação de projeto Supabase, implantação de funções, merge/deploy, operação com dados clínicos, manipulação de segredos, JWT/RLS ou publicação de PR #121/#133.

Gates progressivos e independentes:
1. **G0 — Preparação offline:** snapshot v6 oficial read-only disponível em memória, hashes conferidos, diff mínimo reversível, testes já aprovados, plano de isolamento e custódia. Não usar áudio real; nenhum pedido externo.
2. **G1 — Autenticação no ambiente isolado:** somente após autorização separada para ambiente/projeto e credenciais *de teste* com acesso mínimo; comprovar isolamento, controle de gastos, retenção e logs redigidos. Nenhuma credencial no repositório/chat. Rejeitar se a instância estiver conectada a contas ou dados clínicos de produção.
3. **G2 — Sessão upstream com áudio sintético:** requer **outra autorização explícita**, teto máximo em USD, modelo permitido, conta/projeto de cobrança definido, janela de ensaio limitada e responsável presente. Pode gerar cobrança mesmo que a sessão falhe ou seja abortada. **Não executar agora.**
4. **G3 — Qualidade clínica e decisão de release:** apenas evidências desidentificadas de áudio integralmente fictício, comparação com roteiro de referência, revisão humana e resultados por gate. Nunca promover uma candidata por êxito técnico isolado.
5. **G4 — Publicação:** autorização específica e posterior, separada de G1/G2/G3; comparar CI, rastreio e rollback imediatamente antes. **NÃO AUTORIZADA.**

## 1. Fronteiras de isolamento, custódia e dados

- Usar navegador/perfil descartável, captura de microfone com permissão explicitamente concedida e **áudio criado para o ensaio**, sem voz/identificadores/pacientes reais, sem conteúdo médico de prontuário ou contas produtivas.
- Usar projeto de teste isolado da Supabase (a criar somente após autorização), credencial de teste de menor privilégio e provedor de IA com chave vinculada a projeto/orçamento apropriado; não copiar tokens, env vars, JWT, chaves ou dados de produção.
- Um ensaio com upstream **não é offline** e não pode ser considerado gratuito; impor orçamento confirmado, limite de sessões, teto de duração, acompanhamento de uso e STOP imediato ao atingir limite.
- Proibir conteúdo bruto em artefatos: áudio, transcrição, SDP/ICE, JWT, resposta do upstream, request body, IDs de usuário/paciente/consulta, URL com token ou IP identificável. Logs permitidos: horário UTC, commit, versão/hash, classe de transporte, códigos HTTP **agregados**, contadores, durações arredondadas, flags PASS/FAIL e decisão humana.
- Se a saída de teste contiver uma dessas classes proibidas, **quarentenar e não publicar**; não compartilhar capturas/texto com PII nem pedir que o usuário cole credenciais.

## 2. Pré-voo de integridade, sem chamada paga

| ID | Checagem objetiva | PASS | FAIL/STOP |
|---|---|---|---|
| P01 | PRs #118, #119, #121 e #133 abertas **Draft**; main/base e HEAD fixados | Refs e hash registrados | Branch drift, merge ou publicação não autorizada |
| P02 | V6 hosted original: versão, \`verify_jwt\`, hash do bundle | v6, true, hash exato do cabeçalho | Divergência => congelar; nunca reconstruir a partir da main |
| P03 | Snapshot dos **4 arquivos da v6** verificado por \`reconcileHostedV6()\` do script \`scripts/nexa-realtime-v6-offline-reconcile.mjs\` | File set, comprimento, SHA-256 e patch reversível exatamente aprovados | Fonte faltante, hash alterado, arquivo extra ou invariante ausente |
| P04 | Diff do candidato multipart (PR #121 como hipótese) | Somente mudança para campos multipart textuais \`sdp\` e \`session\` no entrypoint; 3 outros arquivos byte-a-byte iguais | Qualquer alteração de Auth, JWT, modelo, timeout, fallback, logs ou \`deno.json\` |
| P05 | SDP/ICE | Módulo \`scripts/nexa-realtime-ice-offline.mjs\` permanece isolado e testes de timeout/abort aprovados | Candidato ICE integrado sem análise do deadline de 10 s |
| P06 | CI frontend do commit de implementação | #42355477729 SUCCESS; gates clínicos, consentimento, fallback e browsers aprovados | CI regressiva ou evidência insuficiente |
| P07 | Custos e proteção de dados | Projeto isolado, orçamento aprovado, logging redigido, plano de descarte e rollback assinado | Qualquer um ausente => G1/G2 NO-GO |

**Executado neste lote:** somente criação de documento. **Não afirmar que P01–P07 foram todos executados nesta sessão de homologação.** SHA dos 4 arquivos e o procedimento já estão em [reconciliação v6](NEXA_REALTIME_V6_RECONCILIATION_20261107.md).

## 3. Matriz de homologação futura — execução NÃO AUTORIZADA

Usar no máximo uma sessão humana consolidada, com cenário sintético previamente roteirizado; registrar resultados apenas como PASS/FAIL/NOT_TESTED, nunca substituir ausência de ensaio por sucesso da CI.

| ID | Cenário | Evidência mínima para PASS | Condição de FAIL/STOP |
|---|---|---|---|
| H01 | Acesso anônimo ao gateway e funções clínicas | Respostas 401/403 previstas, sem vazamento | Rota produtiva/clinicamente sensível acessível sem Auth |
| H02 | Login de usuário de teste no projeto isolado | Sessão validada e perfil/organização de teste coerentes | Auth de produção, RLS alterada, permissões indevidas |
| H03 | Consentimento inicialmente ausente | Gravação e envio impossibilitados | Acesso ao microfone/transmissão sem autorização |
| H04 | Revogação durante getUserMedia/gravação | Microfone pára; bytes ainda não enviados são descartados; nenhum novo envio | Captura continua, UI reabre gravação antiga, HTTP novo após revogação |
| H05 | Revogação durante WebRTC/chunk/transcrição HTTP | Abort local e revisão invalidam respostas tardias; sem segunda chamada após 401/cancelamento | Reenvio, preenchimento tardio, fallback pago após abort |
| H06 | WebRTC v6 original (baseline), sem mudar produção | Códigos do upstream **apenas agregados**; falha é documentada sem atribuir causa definitiva | Supor que 502 da Edge = 502 do upstream ou registrar SDP |
| H07 | Candidato v6 + multipart textual em sandbox | Negociação obtém resposta SDP válida e DataChannel aberto, se upstream permitir; comparar baseline com mesmas restrições | HTTP 400/401/429/5xx, resposta inválida ou handshake abortado => não promover |
| H08 | ICE/SDP completo no navegador descartável | SDP final válido, sem negociação tardia, e coleta dentro do deadline aprovado | Coleta excede limite, reaparece canal antigo ou requer mudança não aprovada |
| H09 | WebRTC→chunks 10 s e timeout de chunk 18 s | Fallback único, sem abortar chunk pelo controlador da negociação; fila não duplica conteúdo | Recursão/reenvio, fila >4, perda silenciosa de segmento |
| H10 | Pausar/Retomar/Finalizar | Indicadores coerentes; \`live\` só com DataChannel aberto; track realmente mudo em pausa | UI declara ao vivo em fallback ou microfone persiste após parar |
| H11 | Continuidade/qualidade clínica com roteiro fictício | Todos os segmentos do texto fictício reconhecidos sem criar fatos, examinados por médico; perdas explicitadas | Omissão crítica, inventar paciente/acompanhante, declaração de sucesso incompleto |
| H12 | Auth expirada, 400/401/429/5xx e rede inválida | Aborto/falha fechada, sem duplicação, mensagens sem conteúdo sensível | Retentativa silenciosa, alerta enganoso, vazamento |
| H13 | Custo | Uso oficial do provedor conciliável com orçamento e requests de teste, por modalidade/modelo/dia UTC | Sem fatura/uso oficial => status **NOT_TESTED**, economia não comprovada |

**Resultados hoje (9.7):** H01–H13 **NOT_TESTED em homologação externa/física**; parte dos invariantes tem testes sintéticos aprovados na CI, não substituindo o ensaio de H01–H13. Qualquer teste autenticado, upstream ou captura de áudio exige autorização posterior.

## 4. Método de comparação e atribuição de causa

Separar alterações em **uma variável por vez**, com fonte v6 pinada: (A) fonte hosted inalterada; (B) candidate multipart textual *apenas*; (C) ICE/SDP só em proposta isolada posterior. Não ativar (B) e (C) juntos no primeiro ensaio. O upstream 400 é compatível com diferentes causas (multipart, schema, autorização, modelo, quota, SDP/ICE); somente sucesso/erro observado de forma controlada pode distinguir hipóteses. Eventuais erros Realtime recuperáveis não devem acionar novas sessões pagas indiscriminadamente.

Relatório de ensaio autorizado: \`gate_id; run_utc; candidate_sha256; pass|fail|not_tested; upstream_http_status_band; fallback_count; duplicate_count; abort_count; audio_continuity_review_pass|fail|not_tested; billing_match_pass|fail|not_tested; stop_reason; reviewer_approved\`. Nunca incluir valores de áudio/SDP ou identificadores pessoais.

## 5. Economia: reaproveitamento, NÃO nova modelagem

- PR #118: baseline de 7 dias e scripts de custo com logs agregados, limitações de WebRTC/ASR, custo hipotético; não interpretar POSTs ou status 502 como preço real.
- PR #119: gates de consistência financeira por dia UTC, modelo, modalidade e projeto; não tratar inventários incompletos como economia.
- Para comparar economia antes/depois, exigir **exports oficiais agregados da OpenAI** sob o mesmo projeto/escopo, UTC e modalidade (incluindo custos Realtime/audio e transcribe). Conferir diferença de volume/mix de consultas, modalidade e qualidade; sem desenho comparável, informar "impacto não atribuível". Proibir qualquer claim "US$ economizados" apoiado só em requests, logs internos, abort local ou tarifa pública.

## 6. STOP e rollback verificável

**Antes de qualquer publicação:** basta deixar #133/#121 Draft, não operar em produção: não existe rollback produtivo necessário.

**Se um futuro ensaio em sandbox falhar:**
1. Interromper novas sessões e requisições; desativar acesso ao ensaio sem alterar Auth/RLS de produção.
2. Preservar apenas relatório sanitizado, contadores, commit da candidata e razão FAIL; destruir sessão de teste e mídia temporária de acordo com política previamente aprovada.
3. Restaurar **somente no ambiente descartável**, a v6 original dos quatro arquivos com versão/metadata verificadas; conferir checksums e \`verify_jwt=true\`, endpoints e comportamento de bloqueio anônimo, se esse ensaio for autorizado.
4. Não aplicar rollback de função hospedada na produção; ela permaneceu inalterada. Se publicação futura for autorizada separadamente, exigir plano e snapshot específicos de recuperação antes de tocar a função.
5. Reclassificar todos os testes dependentes de autenticação/upstream como NÃO HOMOLOGADOS até evidência nova.

## 7. Decisão operacional / ações humanas

- **Situação atual:** \`G0=DOCUMENTADO\`, \`G1=BLOCKED\`, \`G2=BLOCKED\`, \`G3=BLOCKED\`, \`G4=NO-GO\`. **Nenhuma ação humana necessária para conservar esse estado.**
- **Quando houver pedido de homologação real:** autorização separada para **ambiente descartável, custódia, uso de credenciais de teste e limite financeiro**, depois autorização explícita **independente** para cada ensaio que possa chamar o provedor e gerar custo. Solicitar uma única sessão manual consolidada, com checklist e modelo de relatório acima.
- **Não pedir agora** instalação, senha, token, acesso à conta, consentimento clínico, áudio real, assinatura ou publicação.
- **Liberação produtiva:** exigirá todas as evidências aplicáveis PASS, revisão humana, análise de custo, rollback aprovado e autorização explícita posterior de merge/deploy. É proibido transformar esta preparação em autorização implícita.

**Observação:** este documento não é evidência de operação do microfone, aceitação do SDP, fidelidade médica, contenção de custos pelo provedor nem segurança produtiva integral.
