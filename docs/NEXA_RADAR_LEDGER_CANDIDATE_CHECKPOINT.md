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
- A leitura candidata fixa a maior sequência observada e busca páginas até esse marco; exige sequência contínua e identidade institucional coerente em cada linha. Uma simulação de cliente recuperou 502 eventos em três páginas de dados. Página vazia inicial é marcada como `complete:false`, pois acesso revogado e histórico realmente vazio não são distinguíveis somente por RLS. Falhas, lacunas ou resposta divergente lançam erro em vez de declarar cronologia completa. Isso ainda não comprova recuperação entre dispositivos com Auth real.

## Continuação 4.5 — fila criptografada candidata, sem ativação na interface

- `bindConfirmed` consulta o usuário autenticado e a linha de `consultation_history` no servidor antes de aceitar o vínculo. Pode localizar o ID textual pela combinação canônica de encontro UUID, organização e responsável; erros e ausência de coluna institucional bloqueiam o envio.
- O controller entrega ao gancho `captureEvent` cada evento antes do limite visual de 300. A sequência continua avançando; falha de captura é sinalizada no snapshot. O gancho não foi ligado ao aplicativo publicado e, sem ele, o histórico local continua incompleto após 300 eventos.
- `nexa-radar-encrypted-outbox.js` guarda no IndexedDB somente ID aleatório, IV e ciphertext AES-GCM. O evento é reduzido a campos categóricos e vínculo institucional antes da criptografia. Exige `CryptoKey` não extraível com acesso de criptografia e descriptografia, fornecida por outro componente; a chave não é criada nem salva por esta fila. Escrita só retorna após commit da transação IndexedDB. Retry usa o mesmo ID e remove a entrada apenas após ACK válido da RPC.
- `nexa-radar-ledger-bridge.js` aceita o evento somente quando o encontro do controller coincide com o encontro ativo; o evento permanece pendente até receber o aviso de autosave e verificar Auth e linha remota. Mudança de encontro invalida a resposta tardia. A ponte é candidata e não está carregada em `index.html`.
- A custódia e recuperação segura da chave após reinício ainda não estão definidas. Sem essa capacidade, ativar a fila para dados vinculáveis a pacientes seria inadequado. Também falta alinhar o UUID inicial do controller ao autosave antes do primeiro evento, além de executar a ponte com Auth/JWT reais e a migration em Supabase local. Nenhum teste unitário ou browser sintético supera esses gates.
- O teste Chromium sintético fechou uma página, abriu outra no mesmo contexto, reimportou uma chave de teste fornecida externamente e recuperou 502 entradas criptografadas do IndexedDB. Isso verifica o armazenamento browser e a ausência de texto livre no registro; não valida custódia de chave em uso clínico nem recuperação em outro dispositivo.
- O runner de Supabase descartável foi estendido para criar uma conta sintética no Auth local, autorizar a linha institucional de consulta, enviar um evento pela ponte com JWT real, recuperar a página via RLS e verificar revogação. Esse caminho precisa de execução no CI com a stack local; testes unitários não são substitutos. Nenhum segredo hospedado é usado.
