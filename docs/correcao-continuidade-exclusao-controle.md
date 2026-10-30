# Continuidade e exclusão do Controle operacional

Projeto de destino: **supervisortechnet**, referência **rwstmomeldwrjmczrmnp**.
Nenhuma exclusão, publicação de escala, migration ou implantação foi executada em produção.

## Correções

- A geração agora lê o Sheets oficial naquele momento, em vez de usar somente `current_payload` (a última sincronização salva). Se a leitura falhar, não usa um snapshot antigo como fallback. A ação `read` não sincroniza, aprova, publica nem grava dados.
- O leitor inclui extensões contíguas acrescentadas ao calendário da origem, validando os cabeçalhos. Dezembro pode conter até 04/01; janeiro preserva cada marcação preenchida e gera os vazios restantes, fechando as semanas domingo–sábado até 06/02/2027. A regra é genérica para os próximos meses.
- A identidade é vinculada ao colaborador, não à posição das linhas; nomes são a chave do Controle sem coluna login. Logins legados repetidos não são tratados como identidade única.
- Dias herdados são persistidos no snapshot das novas revisões, bloqueados no editor, na distribuição de folgas e nas sugestões/compensações da IA, inclusive na análise da revisão salva e na edição direta pela API. Violações de cobertura e descanso continuam como pendências; a origem não é corrigida silenciosamente. Uma escala antiga já gerada não é sobrescrita retroativamente.
- A exclusão tem preflight somente de leitura. Se o `gid` salvo diferir da aba mensal atual, pede uma confirmação adicional com o novo identificador (`EXCLUIR 2027-01 ABA <gid>`). Valida mês, datas e colaboradores, revalida a aba e prepara a exclusão no banco antes de remover somente o identificador confirmado. Reparo de vínculo e preparação são atômicos, com controle de concorrência e auditoria do vínculo anterior.
- A revisão aprovada atualmente vinculada é usada, não a versão anterior arquivada. Snapshots, eventos e versões arquivadas são mantidos. Uma exclusão parcialmente concluída pode ser retomada.
- Mensagens JSON do HTTP 409 são mostradas na tela. O erro `_nonReactive` é separado: a versão instalada do `router-core` relê um match removido durante preloading assíncrono. Desativado o preload por intenção/hover; a navegação continua carregando as rotas normalmente. [Issue oficial TanStack #7759](https://github.com/TanStack/router/issues/7759).

## Evidência e limites

Leitura autorizada do Sheets confirmou os identificadores de dezembro (`676818445`) e janeiro (`1290734211`), o término de dezembro em 04/01 e o calendário de janeiro até 06/02. Nenhuma célula foi alterada.

A leitura SQL do Supabase pelo conector foi recusada por permissão. Portanto, o valor exato do `gid` atualmente armazenado em produção não foi confirmado. A mensagem da captura (“A aba foi renomeada ou substituída”) corresponde ao guard de metadados Google, não à confirmação digitada ou ao preload. O novo fluxo reproduz e trata localmente esse tipo de divergência sem escolher outra aba silenciosamente.

## Aplicação pelo responsável (não executada nesta tarefa)

Primeiro, no SQL Editor do projeto **rwstmomeldwrjmczrmnp**, executar **somente** o conteúdo do arquivo `supabase/migrations/20261030164120_schedule_confirmed_tab_deletion.sql`. Ele instala uma função e permissões; não exclui nem publica escalas. Pressupõe as migrations anteriores de exclusão e publicação de revisão já instaladas. Não use `db push` indiscriminadamente para aplicar outras migrations pendentes.

Para copiar o SQL no PowerShell:

```powershell
Set-Location D:\sistemas\supervisores
Get-Content -Raw .\supabase\migrations\20261030164120_schedule_confirmed_tab_deletion.sql | Set-Clipboard
```

Depois, implantar apenas as três funções modificadas no projeto explícito:

```powershell
npx supabase functions deploy schedule-operational schedule-ai schedule-edit --project-ref rwstmomeldwrjmczrmnp
npm run build
```

Publicar o frontend pelo fluxo habitual usando o `dist` gerado. `npm run build` sozinho não publica o site. Para desenvolvimento, `npm run dev`.

Após atualizar, abrir a exclusão de janeiro, conferir o título/identificador exibidos e digitar exatamente a nova confirmação. A aba de dezembro não é o alvo. Só depois da exclusão desejada, gerar janeiro novamente para receber as marcações atuais da origem. Nada é excluído automaticamente ao instalar a correção.

## Validação local

```powershell
npm test
npm run typecheck
npm run build
npx deno test --allow-env --import-map tests/edge/import-map.json tests/edge/schedule-operational.deno.ts tests/edge/schedule-month-delete.deno.ts tests/edge/schedule-edit.deno.ts tests/edge/schedule-ai-preview.deno.ts tests/edge/schedule-scope-guards.deno.ts
```

SQL transacional em banco PostgreSQL local vazio terminando em `_test`: `scripts/test-schedule-publication.mjs`, configurado por `SCHEDULE_PUBLICATION_TEST_URL`. O runner recusa servidores não locais. Inclui reutilização da mesma aba entre revisões, versão antiga arquivada, confirmação errada, conflito de vínculo, rollback do reparo, histórico e finalização.

Navegador com tráfego externo interceptado: iniciar Vite local em `127.0.0.1:5175` e executar `node scripts/verify-schedule-continuity.mjs`. Confere dias herdados, 06/02, confirmação do novo gid, texto do HTTP 409 e navegação com hover/cliques sem preloading.
