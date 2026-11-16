# Publicação com ressalva

O administrador ativo pode publicar uma versão salva que tenha pendências de cobertura, funções ou distribuição 5x2. A publicação normal continua bloqueando pendências.

No gerador, selecione uma versão salva vinculada à aba mensal oficial e use **Publicar com ressalva**. A tela consulta novamente o Sheets, lista as pendências, exige justificativa de 20 a 2000 caracteres e confirmação explícita. Uma versão sem pendências segue a confirmação normal.

A aceitação vale para aquela publicação. O servidor calcula SHA-256 sobre o conteúdo atual do Sheets, planejamento, vínculo, política e avisos. Uma mudança invalida a confirmação. Sob lock, o banco também confere as fotografias do rascunho e a versão do vínculo. A ressalva não muda regras futuras, folgas fixas, marcas herdadas, permissões, origem oficial, estrutura ou proteção contra substituição de outra escala.

A RPC transacional preserva os avisos originais, publica a fotografia atual e registra a justificativa, administrador, data, pendências, versão, aba e hash do conteúdo. O histórico mantém o evento `publication_exception_accepted`; a versão guarda `policy_snapshot.publicationException` e aparece como **OFICIAL COM RESSALVA**, com consulta à justificativa. Falha de auditoria desfaz publicação, sincronização e eventual troca de vínculo.

## Instalação

Migration: `supabase/migrations/20261116192215_schedule_publication_exception.sql`.
Função: `schedule-operational`, incluindo `_shared/schedule-publication-exception.ts`.
Frontend: `ScheduleGeneratorDialog`, `SchedulePublicationReviewDialog` e serviço operacional.

A migration foi instalada somente no projeto Supervisores `rwstmomeldwrjmczrmnp` em 16/11/2026, e a Edge Function foi publicada. Nenhuma escala real foi publicada na instalação. A entrega da interface depende da publicação do frontend.

## Verificação

- TypeScript e build aprovados.
- 103 testes Edge aprovados, sem acesso real ao Google nos testes.
- Suíte Vitest: os 657 testes existentes e adicionais passaram; a nova fixture de revisão foi corrigida para representar uma semana completa e seus três testes também passaram (658 testes ao todo).
- `tests/schedule-publication-exception.sql`: 18 verificações PostgreSQL com tabelas temporárias e ROLLBACK, incluindo autorização, concorrência, avisos preservados, auditoria obrigatória e troca de revisão atômica.
- RPCs com `SECURITY INVOKER`, execução restrita a `service_role`.

Os testes SQL contêm cópias isoladas das definições vigentes e da migration. Se essas funções mudarem, atualize a fixture junto com elas.
