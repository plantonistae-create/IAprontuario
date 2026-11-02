# Transcrição integral: correções concorrentes

Em ambiente Supabase local descartável, três contextos de navegador com Auth real local recuperaram a mesma consulta sintética. O navegador B gravou uma correção. O navegador C, aberto antes dessa gravação, tentou registrar outra revisão com o mesmo número; o banco recusou a escrita conflitante. A interface manteve o texto digitado e exibiu o conflito dentro do diálogo, com instrução para recarregar as versões. Após recarregar, C recuperou original, texto usado na estruturação e a correção de B. A transcrição original não foi sobrescrita.

O runner também confirmou SHA-256, isolamento entre organizações, revogação e ausência de duplicatas. A leitura final das fixtures sintéticas retornou zero linhas e a stack foi destruída. Não houve consulta a prontuários reais nem migration hospedada.

Esta prova cobre um conflito de revisão. Permanecem pendentes timeout de sincronização, expiração de JWT durante salvamento, rascunhos puramente locais, interrupção do navegador no meio da correção e recuperação protegida de produção. A PR #93 segue Draft, com a funcionalidade desativada em produção.
