# NEXA — P0 WebRTC 9.8 | Registro de decisão e transferência de homologação

**Natureza:** documento de preparação; NÃO é solicitação de execução.
**Estado:** NO-GO para homologação autenticada, requisições pagas e merge/deploy.
**Data de referência:** 2026-11-07.
**Fonte:** [Roteiro 9.7](NEXA_P0_WEBRTC_97_HOMOLOGATION_GATE_20261107.md), com H01–H13, P01–P07, PASS/FAIL/STOP e rollback.
**Implementação já aprovada na CI:** PR #133 HEAD `ed53215208b27d32882fbb4befc5e75080eeda6f`, [CI #42355477729](https://github.com/plantonistae-create/IAprontuario/actions/runs/42355477729) SUCCESS. A CI documental #42372226688 do HEAD `0839b7036a2356d98e1bab8dc95034abcaf39a12` foi consultada durante a preparação; seu resultado final deve ser verificado, sem extrapolar autorização.
**Fonte de verdade da função hospedada:** Supabase `realtime-call` v6, `verify_jwt=true`, `ezbr_sha256=1675c95f6b1a25569c6af86e5c461f05fd475ee0d8a759439631d2d56221e005`. Sem substituição pela função da main/staging ou PR #121.

## 1. Sequência de decisão com autorização independente

| Fase | Responsável pela decisão | Entrada necessária | Critério para avançar | Estado |
|---|---|---|---|---|
| G0 — Pré-voo offline | Responsável técnico de segurança | HEAD/CI registrados; snapshot v6 pinado; diff de multipart somente textual; roteiro de rollback | Checklist P01–P07 auditado; snapshot completo de 4 arquivos verificado no momento do ensaio futuro; nenhuma divergência | Roteiro preparado; checagem operacional integral não executada |
| G1 — Ambiente de testes | Responsável pelo projeto/segurança | Autorização explícita de ambiente descartável, projeto de teste, acesso mínimo e privacidade | Auth/RLS e projeto segregados; credenciais e dados de produção ausentes; teste autenticado aprovado | **BLOQUEADO** |
| G2 — Upstream com áudio fictício | Responsável pelo custo + responsável técnico | Autorização **separada** para chamada cobrável; orçamento máximo numérico, modelo, conta, duração e limite de sessões | Sem logging de áudio/SDP/JWT; resultado comparável da v6 original vs candidata multipart, uma variável por vez; interromper ao atingir teto | **BLOQUEADO** |
| G3 — Continuidade clínica | Médico revisor designado | Gravação estritamente fictícia e matriz H01–H13, dados desidentificados | Completude e fidelidade ao texto de referência, sem sintomas/relatos inventados; perda ou estado incerto explicitado; FAIL interrompe | **BLOQUEADO** |
| G4 — Release produtivo | Responsável pela publicação + médico revisor | Aprovação de G0–G3, CI do HEAD exato, rollback testado e autorização final expressa | Todos os gates aplicáveis PASS; zero FAIL críticos; privacidade/custos aprovados e janela de rollback definida | **NO-GO** |

Nenhum responsável foi identificado ou aceitou a função neste documento. A coluna de papéis **não atribui aprovação presumida** ao usuário ou à equipe.

## 2. Registro de bloqueios reais — não confundir com falha da CI

| ID | Bloqueio | Evidência existente | Evidência ainda exigida para fechar |
|---|---|---|---|
| B01 | Staging autenticado não homologado | Smoke anônimo 401/403 passou; credenciais de teste ausentes | G1 autorizado; usuário/organização fictícios isolados; autenticação, autorização e RLS de teste verificadas |
| B02 | Aceitação multipart pelo upstream desconhecida | PR #121 Draft; snapshot v6 e patch reversível documentados | G2 autorizado; status da OpenAI capturado **só em agregados**, comparação A/B controlada, resposta SDP válida ou falha classificada |
| B03 | SDP/ICE e continuidade do áudio não homologados em navegador com hardware | Módulo ICE offline e casos sintéticos CI aprovados | H04–H12 testados com microfone e roteiro inteiramente sintéticos, decisão sobre limite de negociação de 10 s |
| B04 | Resultado clínico ainda não revisado por médico em ensaio controlado | Testes de UI/contratos e gate de consentimento passaram na CI | H11 avaliado sem dados reais; verificar perda, atribuição de locutor, falha de fallback e possibilidade de recuperar nota sem fato inventado |
| B05 | Economia em USD não comprovada | PR #118 (baseline parcial) e #119 (gates de custos) Draft | Fatura/uso **oficial agregado** por dia UTC, projeto, modelo e modalidade; comparação de volume/mix com mesma definição e controle de custo de áudio |
| B06 | Rollback produtivo não homologado | Hash da v6 original e plano documental de sandbox | Preservar origem verificável e ensaiar recuperação no **sandbox autorizado**, antes de qualquer planejamento de deploy produtivo |
| B07 | Autorização de publicação inexistente | PRs #118, #119, #121 e #133 Draft | Autorização de merge/deploy **específica e posterior**, mesmo se G0–G3 vierem a PASS |

**Prioridade:** B01/B06 para preparar isolamento; B02/B03 para decisão técnica; B04 para segurança clínica; B05 para economia; B07 somente após todos os demais. Não é necessário tentar novos testes offline que já passaram.

## 3. Ficha de autorização futura (deixar em branco agora)

Preencher apenas em uma sessão futura, depois de autorização explícita; nunca cole credenciais ou registros clínicos no GitHub/ChatGPT.

| Campo obrigatório | Valor agora |
|---|---|
| Gate solicitado (G1, G2, G3 ou G4) | NÃO SOLICITADO |
| Escopo operacional e endereço do **projeto isolado** | NÃO DEFINIDO |
| Papel e confirmação do autorizador | NÃO DESIGNADO |
| Data/hora UTC e duração máxima | NÃO DEFINIDA |
| Modelo e modalidade permitidos | NÃO DEFINIDOS |
| Número máximo de sessões e requisições | NÃO DEFINIDO |
| Teto monetário em USD (G2) e mecanismo de STOP | NÃO APROVADO |
| Áudio sintético/roteiro de referência aprovado pelo revisor | NÃO FORNECIDO |
| Commit, bundle/candidate hashes e pacote de rollback | SOMENTE REFERÊNCIA DOCUMENTAL |
| Cobertura H01–H13, evidência sanitizada e decisão clínica | **NOT_TESTED** |
| Resultado final e assinatura de autorização de release (G4) | **NO-GO** |

Ao obter aprovação de uma fase, registrar apenas a **decisão e os metadados sanitizados**, nunca um segredo, áudio, transcript, SDP, ICE, token, solicitação ou resposta bruta.

## 4. Regra de parada, liberação e custódia

**STOP imediato** por divergência de hash, troca de ambiente não autorizada, chamada upstream fora do teto, dado real, logs com conteúdo sensível, 401/403 inesperado, retorno 400/429/5xx não explicado, áudio incompleto, reenvio após revogação ou falha crítica clínica. Não transformar STOP em retry automático nem usar a conta de produção para continuar.

**Rollback:** antes de deploy, nenhuma mudança produtiva foi feita e nenhuma reversão produtiva é necessária. Depois de ensaio isolado, restaura-se apenas o ambiente descartável usando a v6 pinada; se uma publicação produtiva vier a ser autorizada futuramente, exigir procedimento próprio de rollback auditado e testado antes do deploy. Nunca substituir cegamente a função v6 pela implementação da branch main.

**Custódia:** somente registro dos IDs dos gates, PASS/FAIL/NOT_TESTED, hash/commit, durações agregadas, classificação de status, custo agregado oficial e validação humana. Excluir áudio/SDP/transcrição/JWT/PII de documentação e artefatos. O descarte dos artefatos do sandbox deve seguir política aprovada antes do ensaio.

## 5. Decisão do lote 9.8

- **FEITO:** ficha de decisão/documentação preparada; critérios de autorização e dependências explicitados sem duplicar código, cálculos financeiros ou testes sintéticos.
- **NÃO FEITO:** testes autenticados, upstream, microfone, dados reais, chamadas pagas, merge, deploy, alteração de segredos/JWT/RLS ou criação de infraestrutura.
- **CONCLUSÃO:** **NO-GO** para homologação real e release até autorização específica. Economia medida em dólares permanece **não comprovada**. A aprovação da CI jamais implica aprovação de G1–G4.
