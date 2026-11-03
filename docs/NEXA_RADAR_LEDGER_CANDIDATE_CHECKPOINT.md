# Radar temporal: checkpoint da migration candidata

Esta branch contém uma migration **candidata**, sem aplicação em staging ou produção. Ela depende da expansão institucional da PR #92 e preserva a distinção entre o ID textual de `consultation_history` e o UUID de `encounter_id`.

## Contrato ensaiado localmente

- Eventos categóricos append-only, sem áudio, transcrição, fala literal ou prontuário.
- Sequência monotônica atribuída em transação pelo banco, com bloqueio por consulta.
- Mesmo `event_id` e mesmo conteúdo retornam a sequência anterior; reutilização com conteúdo alterado falha.
- Leitura limitada ao médico responsável com acesso clínico ativo ou ao revisor ativo da organização. Escrita exige médico responsável, membership ativo e consulta em andamento.
- Paginação por `(consultation_id, sequence)`; 500 eventos sintéticos, eventos manuais e dois envios concorrentes.
- RLS forçada e negação de INSERT, UPDATE e DELETE diretos ao cliente.

Executar `node scripts/run-local-radar-ledger.mjs` para repetir o ensaio em stack local descartável. O script não usa projetos hospedados. O teste adicional de revogação e as verificações de grants estão em `tests/radar-ledger/ledger-final.sql`.

## Gate ainda bloqueado

A migration não deve ser aplicada antes da reconciliação do esquema e da recuperação protegida da PR #92. O cliente ainda não envia eventos para esse contrato: o histórico local limitado a 300 eventos permanece incompleto e sinaliza truncamento. Recuperação entre dispositivos, auditoria clínica por pergunta e avaliação médica permanecem pendentes. A origem declarada pelo cliente é metadado de proveniência, não assinatura institucional.

O vínculo `ON DELETE RESTRICT` evita apagar a cronologia junto com a consulta, mas pode impedir o fluxo atual de exclusão de consultas. Revisar retenção e descarte antes de qualquer aplicação hospedada; este ensaio não homologa esse comportamento da interface.

## Continuação de 03/11 — contrato do cliente, ainda sem envio ativo

- `nexa-radar-ledger-client.js` prepara a chamada autenticada à RPC. Só aceita uma consulta já confirmada com `consultation_history.id` textual, `encounter_id` UUID, organização, médico responsável e estado de encontro coerentes. Rejeita vínculos locais, cruzados ou alterados. Envia somente campos categóricos da allowlist e exige sequência positiva de ACK do servidor; erros não são apresentados como sincronização.
- O controlador agora atribui UUID a cada evento local e preserva estado/prioridade anterior e posterior, motivo codificado, origem e versão. Esses metadados permitem montar a requisição sem incluir fala, transcrição, nota ou trecho de paciente. Eventos locais de snapshots antigos sem ID válido continuam visíveis, mas são marcados como incompletos e não podem ser reenviados como eventos autenticados.
- Testes sintéticos verificam um ID de consulta legado textual distinto do UUID do encontro, rejeição de associação estrangeira, omissão de texto clínico e ausência de ACK falso. A suíte, lint, typecheck e build locais passaram. A RPC ainda não foi acionada com Auth real por este adaptador; a migration não foi aplicada em ambiente hospedado. Falta um outbox durável que capture os eventos antes e depois do limite local de 300, além de vincular a consulta após autosave confirmado e de resolver a política de retenção e a dependência da PR #92.
