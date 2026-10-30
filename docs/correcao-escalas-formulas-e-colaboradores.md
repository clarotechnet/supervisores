# Escalas de Controle: fórmulas auxiliares e inclusão de colaboradores

## Causa do HTTP 409

A leitura da aba mensal rejeitava qualquer célula preenchida abaixo das pessoas
planejadas. Os totais e os critérios isolados `T. 1` / `PLANTÃO` eram tratados como
alteração da quantidade de colaboradores, mesmo muitas linhas abaixo da tabela.
A leitura da escala anterior também confundia colunas auxiliares com novas datas.
Os avisos `[Violation]` de duração dos handlers no navegador são avisos de
desempenho; não são a validação que devolve esse 409.

## Comportamento corrigido

- Totais numéricos sem Nome/Função, linhas vazias e legendas isoladas de códigos
  conhecidos são ignorados. A distância entre a tabela e esses resumos não importa.
- Colunas auxiliares após as datas, como `PLATÕES` e `quantidades`, não viram dias
  da escala. Uma extensão real continua exigindo datas consecutivas, até 42 dias.
- Uma nova linha com Nome e Função válidos é importada no Controle RN. Dias vazios
  ficam vazios; o sistema não inventa marcações. As linhas podem estar reordenadas.
- Pessoas existentes não são removidas, renomeadas ou duplicadas silenciosamente.
  Isso inclui pessoas adicionadas em sincronizações anteriores.
- As inclusões atualizam a escala oficial vinculada e suas contagens na mesma
  transação que registra o histórico. O planejamento e a versão original ficam
  intactos. Repetir a atualização não duplica a inclusão ou seus eventos.
- Se houver pessoas novas ainda não sincronizadas, o editor pede Atualizar via API
  antes de permitir uma edição de célula.
- As demais frentes mantêm o contrato original de quantidade de pessoas.

## Aplicação manual — nada foi publicado automaticamente

Projeto correto: **supervisortechnet**, referência **rwstmomeldwrjmczrmnp**.
Nenhuma célula do Sheets ou escala real foi alterada durante os testes.

1. Para permitir inclusões de colaboradores, executar no SQL Editor desse projeto
   o conteúdo integral de
   `supabase/migrations/20261030191159_schedule_control_roster_sync.sql`.
   A migration apenas instala a regra; não sincroniza nem publica escalas.
   Não executar `db push` indiscriminadamente: há outras migrations locais de
   trabalhos anteriores que precisam ser avaliadas separadamente.
2. No diretório do projeto, publicar as duas funções que usam o leitor corrigido:

   ```powershell
   npx supabase functions deploy schedule-operational schedule-edit --project-ref rwstmomeldwrjmczrmnp
   ```

3. Para a mensagem que informa quantas pessoas novas entraram, publicar o frontend
   pelo fluxo habitual do projeto. Build local:

   ```powershell
   npm run build
   ```

4. Reabrir a tela e clicar em **Atualizar via API**. Não é necessário remover as
   fórmulas, legendas ou colunas auxiliares da planilha.

Apenas ignorar os resumos não exige SQL novo; importar pessoas novas exige a
migration acima. Sem ela, a API mostra a orientação e não grava parcialmente.

## Validação local

- 517 testes Vitest, incluindo o formato de 42 pessoas, totais em 45–46,
  legendas em 59–60, indicadores AN/AO e leitura até 04/01.
- 94 testes Deno das Edge Functions, com rede externa sem permissão e APIs mockadas.
- 99 verificações PostgreSQL em cluster temporário isolado, incluindo permissões,
  crescimento da escala oficial, auditoria, idempotência, concorrência e rollback.
- Typecheck, build e lint dos arquivos alterados passaram.
- A estrutura lida da aba foi reproduzida localmente com nomes anonimizados:
  42 pessoas, 37 datas até 04/01/2027, zero inclusões falsas e zero alterações.

Comandos básicos de conferência:

```powershell
npm test
npm run typecheck
npm run build
npx deno test --allow-env --import-map tests/edge/import-map.json tests/edge/schedule-access.deno.ts tests/edge/schedule-ai-generation.deno.ts tests/edge/schedule-ai-preview.deno.ts tests/edge/schedule-edit.deno.ts tests/edge/schedule-month-delete.deno.ts tests/edge/schedule-official-source.deno.ts tests/edge/schedule-operational.deno.ts tests/edge/schedule-scope-guards.deno.ts
```

O teste SQL usa `node scripts/test-schedule-publication.mjs` com
`SCHEDULE_PUBLICATION_TEST_URL` apontando exclusivamente para um banco **local,
novo e vazio**, cujo nome termine em `_test`. O script rejeita URLs remotas.
