# Radar clínico — distinção entre pergunta e resposta

Checkpoint sanitizado de 2026-11-01. Esta alteração é um reparo limitado de atribuição de fala na trilha P0-A. Não constitui homologação clínica completa do Radar 4.0.

## Falha reproduzida em `main` (`e9c0396`)

Com transcrições sintéticas e sem pontuação interrogativa, o motor tomava perguntas do médico como achados positivos do paciente. Em `Médico: Tem falta de ar. Paciente: Não.`, a dispneia ficava `known_present` e um alerta de dispneia era emitido. `Médico: Dor no peito.` também virava dor torácica presente sem resposta. Uma fala do acompanhante sobre febre virava febre do paciente.

## Correção candidata

- Perguntas clínicas do médico reconhecíveis sem `?` aguardam resposta; um `sim` ou `não` do próprio médico não responde sua pergunta.
- Fala de acompanhante não confirma nem nega automaticamente um achado do paciente; permanece `unknown` para confirmação.
- Pergunta com alternativas e resposta elíptica continua ambígua.
- Relato espontâneo afirmativo do paciente e medida explícita do médico continuam disponíveis como evidência.
- O motor não escreve achados no prontuário. O código anterior continua recuperável pelo commit de `main`.

Comparação de estados em casos sintéticos: pergunta sobre febre seguida de `não`, `known_present` → `known_absent`; pergunta sobre dispneia seguida de `não`, `known_present` → `known_absent`; pergunta isolada sobre dor torácica, `known_present` → `not_asked`; relato de febre pelo acompanhante, `known_present` → `unknown`; relato positivo do paciente permanece `known_present`.

## Verificações e limite

Na retomada 4.1, a matriz sintética incluiu diarreia, cefaleia, trauma de joelho, impacto craniano, dispneia, broncoespasmo, dor torácica, dor abdominal e febre. Ela revelou duas lacunas corrigidas: “bati a cabeça” não ativava as perguntas neurológicas de TCE e “chiando” não ativava a verificação de gravidade do broncoespasmo. A atribuição do falante agora persiste entre frases até um novo rótulo explícito.

Passaram 96 testes focados de contexto, decisão, controller e atribuição de fala, além da suíte geral, lint, typecheck, build e E2E completo em Chromium e WebKit. A falha anterior de captura local foi reproduzida como restrição de loopback do sandbox; o mesmo E2E de gravação passou em 1440 px e 390 px com o servidor local autorizado. A avaliação de pertinência clínica por médico revisor continua pendente. Não há mudança de banco ou de função hospedada nesta correção.
