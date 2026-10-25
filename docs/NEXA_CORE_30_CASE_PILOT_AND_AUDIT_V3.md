# NEXA Core — piloto de 30 casos, auditoria Radar v3 e exportação
Data: 25/10/2026. Documento operacional, não autorização para treinamento ou mudança de finalidade dos dados.

## Uso clínico e auditoria
1. O médico continua atendendo e transcrevendo normalmente. O sistema mantém o outbox idempotente e snapshots separados do prontuário.
2. O envio de auditoria capta automaticamente fatos estruturados do Radar: conceitos, prioridade, estado e versões, sem frases, áudio, transcrição ou PII na camada categórica de captura.
3. Mais tarde, o revisor abre Auditoria → Fila e confere documentação, comorbidades, alergias, medicamentos, hipótese/CID e conduta.
4. Na aba Radar, marca explicitamente "Revisei o comportamento do Radar" apenas se houver snapshot. Classifica erros ou marca revisão concluída sem erros. Um clique operacional nunca é verdade clínica.
5. Aprovar, corrigir ou descartar chama um único RPC transacional. Falha da anotação ou da aprovação reverte tudo. Descartados não são exportáveis.
6. Após a auditoria, só o Radar pode receber revisões adicionais, com número de revisão e proteção contra alteração concorrente entre computadores.

## Camadas separadas
- Snapshot original da IA e ficha final do médico: mantidos separadamente.
- Resultado clínico: approved, corrected ou discarded; auditado não significa autorizado para treinamento.
- Revisão específica do Radar: not_reviewed ou reviewed; erros categóricos por conceito, sem falas livres.
- Direitos comerciais e desidentificação: aprovação independente na tabela nexa_core_dataset_approvals. Nenhuma aprovação automática.
- NEXA Core: futura API independente recebe dados com proveniência; a API atual continua até existir modelo clinicamente validado.

## Exportação
O exportador de administrador autenticado produz JSONL paginado e manifesto com SHA-256:
- Artefatos originais/finais/corrigidos, com identificadores pseudônimos HMAC;
- Feedback de cliques explicitamente rotulado como interação não clínica;
- Revisão humana do Radar (nexa-core-radar-labels-v3) e versões de motor/provedor/modelo/prompt/evidência/frontend;
- Status de ausência de revisão, sem fabricar rótulo;
- Aviso de que a separação ainda é por CASO, não validada por paciente e não pronta para treinamento.
Não exporta áudio, transcrição original, IDs de pacientes/médicos ou casos descartados. Texto clínico exportado é condicionado a revisão manual de desidentificação e fundamento jurídico registrado.

## Roadmap
- 30 auditados: primeiro marco do piloto e avaliação de confiabilidade do fluxo, NÃO de independência.
- 30–50 auditados e 200 cenários sintéticos: testes da qualidade do Radar.
- 100–150 casos, ao menos 50 com anotação Radar: conjunto versionado inicial e benchmarks.
- 300–500 casos diversos e avaliações reservadas: estudos de modelos próprios. Independência completa exige também ASR, diarização, estruturação e desidentificação próprios.

## Situação real observada antes desta implementação
Agregados de produção em 25/10/2026: 6 casos clinicamente auditados, 124 pendentes, 0 com autorização jurídica registrada para exportação de treinamento. Nenhum prontuário foi consultado ou alterado para essa contagem.

## Deploy futuro
Migration nova aplicada e verificada somente em staging. Ainda faltam CI, validação de interface, backup da produção, aprovação de merge/deploy e atualização ordenada do backend/exportador. A UI não deve ser publicada antes da migration e das Edge Functions.

## Auditoria de cada pergunta (v4)
- O controlador do Radar reúne, por identificador estável, perguntas sugeridas ao longo da consulta, não somente as que ainda permanecem abertas no final. O snapshot acompanha os checkpoints do atendimento. A captura categórica, além do identificador, mantém conceito, prioridade, estado e sinal de alerta, sem falas ou textos livres.
- Após desidentificação, a Auditoria → Caso → Radar mostra o texto de cada pergunta quando recuperável, o motivo/justificativa do Radar quando disponível, prioridade, e duas seleções humanas: **Pertinente / Desnecessária / Depende do contexto**, mais o motivo da avaliação. Se a desidentificação não conservar determinado texto, a interface informa que ele não está disponível e impede marcar a avaliação do Radar como totalmente concluída.
- O revisor pode escrever as perguntas genéricas que faltaram (conceito, pergunta, prioridade e justificativa); o formulário rejeita identificadores óbvios. Essas sugestões são propostas editoriais para análise futura e não entram diretamente no motor clínico.
- A conclusão integral exige julgar **todas as perguntas** do snapshot seguro. A auditoria do prontuário pode ser aprovada independentemente; classificações parciais do Radar ficam indicadas como **não revisadas integralmente**. Revisões após a aprovação são versionadas e verificadas por controle de concorrência.
- A migração SQL v4 acrescenta campos às revisões e ao histórico, funções transacionais específicas e revoga as chamadas legadas v3 que poderiam definir “Radar revisado” sem avaliações por pergunta.
- Quando existir aprovação jurídica/privacidade e revisão clínica explícitas, o JSONL contém **as perguntas desidentificadas alinhadas aos identificadores das classificações**, os motivos, as prioridades e eventuais perguntas faltantes. O exportador falha de forma segura caso uma avaliação completa não corresponda à lista original.
- **Exemplo conceitual:** a pergunta de avaliação neurológica pode ser classificada diferentemente em um caso documentado de contusão isolada de joelho e em um TCE. Isso é um **julgamento do auditor caso a caso**, jamais um bloqueio automático de perguntas em lesões de membro: lesões associadas, sinais de gravidade e mecanismos de trauma podem mudar a pertinência.
- A lista de perguntas é limitada a 150 itens por episódio; históricos truncados são sinalizados e não recebem selo de avaliação integral. Checkpoints antigos podem conter menos informações. Nenhuma pergunta é reconstruída retrospectivamente como se tivesse sido sugerida.
- A exportação é um artefato pseudonimizado e condicionado à verificação de direitos; **não constitui comprovação de anonimização, prontidão de treinamento ou validação clínica independente**.
