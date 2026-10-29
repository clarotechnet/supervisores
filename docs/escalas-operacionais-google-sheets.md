## Publicação oficial da escala operacional (28/10/2026)

Estado informado e preservado nesta revisão: a aba `Controle DEZEMBRO 26 - 5X2`
já existe e a versão 2 aguarda aprovação. Não recrie a aba. A implementação está
validada localmente; a migration de publicação e o deploy dependem de autorização.
A aprovação real deverá ser confirmada pelo administrador no sistema.

A criação da aba mensal **NÃO publica**: apenas vincula o draft ao Sheets.
A etapa oficial é explícita, controlada e auditada:

1. Admin abre `Escalas > Gerar prévia 5x2`, encontra a revisão com aba mensal
   vinculada e usa **Aprovar e publicar**. Antes, aparece confirmação.
2. A Edge Function `schedule-operational` lê a aba Google e valida nomes/datas,
   sem escrever no Sheets. Executa `public.schedule_operational_publish` com
   `p_sheet_id`, `p_actor_id`, `p_expected_updated_at`, `p_payload` e `p_changes`.
3. Essa RPC sincroniza e publica em uma transação e bloqueia pendências obrigatórias,
   revisões conflitantes ou escala oficial de outra origem. Salva
   `schedule_uploads` como **Google Sheets - Escala operacional oficial**,
   marca draft `approved`, registra `approved` no histórico e o aprovador.
4. O painel principal passa a ler normalmente a escala oficial de
   `schedule_uploads`. Uma faixa compacta mantém o link para a ABA editável.
   O histórico do gerador passa a identificar a revisão como **OFICIAL**,
   não mais como rascunho.
5. Após editar `Controle DEZEMBRO 26 - 5X2`, **Atualizar via API**
   usa a aba oficialmente vinculada, mesmo se outras revisões em rascunho
   forem criadas depois. A nova função `schedule_operational_apply_sync`
   atualiza atomicamente current_payload, auditoria e `schedule_uploads`.

Segurança: somente perfis **admin ativos** podem publicar (verificado na Edge).
A RPC não é concedida a anon/authenticated; somente service_role da Edge.
Importação oficial existente de outra origem não será sobrescrita.
Arquivos Google antigos não são alterados automaticamente.

**Precisa executar** a nova migration local:
`supabase/migrations/20261028170000_publish_operational_schedule.sql`.
Depois **reimplantar** `schedule-operational` no projeto `rwstmomeldwrjmczrmnp`.
Nenhuma migration foi aplicada nem função foi publicada por esta alteração.
Não fazer commit/push sem autorização.

## Revisão 28/10/2026 — Controle RN usa o arquivo Google Sheets EXISTENTE

**Este fluxo substitui a criação de um arquivo separado apenas para**
`natal / controle-operacional`. A planilha verdadeira é **Escalas TechNET -
RN Controle — setembro**, já usada por `Atualizar via API`.

- ID do arquivo confirmado no Google Drive:
  `1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64`.
- Aba existente preservada: `Controle NOVEMBRO 26 - ORIGINAL`
  (Google sheetId `1202571719`, posição 120).
- Nova aba esperada: `Controle DEZEMBRO 26 - 5X2`, imediatamente após novembro.
- O backend obtém o ID pela variável `GOOGLE_SHEETS_RN_CONTROL_ID`,
  confere se bate com o arquivo acima e aborta sem modificar o Google se
  estiver ausente ou divergente.
- A operação agora usa **duplicateSheet** na mesma planilha, mantendo o estilo
  original. Só na nova aba são substituídos os valores e aplicadas cores
  condicionais e validação dos códigos.
- Cabeçalho de duas linhas: `Mês-ano:`, `Nome` e `Função` nas
  colunas A/B; dias de calendário começam na C, incluindo transição
  novembro/dezembro e janeiro. A identificação via login é interna no Supabase.
- O link da operação abre a nova aba (gid), no **mesmo arquivo**.
- A nova tabela `schedule_operational_sheets.sheet_tab` identifica cada
  competência; a antiga restrição UNIQUE de `spreadsheet_id` é substituída
  por UNIQUE (`spreadsheet_id`,`sheet_tab`).
- Ao clicar **Atualizar via API**, se a competência tiver aba operacional,
  o backend lê **somente aquela aba**, valida nomes, funções, dias,
  registra alterações no Supabase e deixa as abas originais intactas.
  Outros setores continuam com o fluxo anterior.
- Rascunho vinculado à planilha separada da versão 1: **não é migrado ou
  sobrescrito automaticamente**. Ele pode ser arquivado/ocultado da lista
  sem apagar a planilha/histórico; salve uma nova revisão antes de criar a
  aba no arquivo mestre.
- Segurança: se a aba dezembro já existir, o sistema interrompe a criação
  sem sobrescrever dados; use a aba já existente e sincronize.
- A planilha original de novembro, todas as outras abas e o Google Sheets
  separado criado antes permanecem inalterados.

### Habilitar (nenhuma etapa executada automaticamente)

1. Executar no SQL Editor do projeto Supervisores
   `supabase/migrations/20261028160000_schedule_operational_shared_workbook_tabs.sql`.
2. Conferir no Supabase que o secret `GOOGLE_SHEETS_RN_CONTROL_ID`
   aponta para o arquivo original indicado acima. A conta Google autenticada
   pelo `GOOGLE_REFRESH_TOKEN` precisa ter **acesso de edição** nele.
3. Reimplantar a Edge Function `schedule-operational` no projeto correto.
4. Em `Gerar prévia 5x2`, salvar uma nova revisão do modelo corrigido
   e usar `Criar aba de dezembro no Sheets Controle`.
5. Confirmar que a aba nova aparece à direita da aba original de novembro,
   alterar uma célula de teste e clicar `Atualizar via API`. Conferir histórico
   e dados operacionais.

A criação e a sincronização só são executadas por ação explícita do usuário.
Nenhuma planilha foi editada durante a implementação.

## Validação final da publicação — 28/10/2026

Implementação local revisada pelo Desktop Commander em D:/sistemas/supervisores.
A migration de publicação não foi aplicada no Supabase de produção. Não houve
aprovação de escala real, edição do Google Sheets, commit, push, merge ou deploy.

### Comportamento final

- O administrador ativo escolhe uma versão vinculada no histórico de
  "Gerar prévia 5x2" e confirma "Aprovar e publicar".
- A Edge lê somente a aba mensal esperada no arquivo original Controle RN.
  Publicar e sincronizar não escrevem no Google Sheets.
- A publicação envia o snapshot lido, as diferenças e o timestamp esperado para
  uma única RPC. A mesma transação sincroniza os dados, grava as alterações,
  aprova a versão, cria a escala em schedule_uploads e registra o evento aprovado.
  Qualquer falha desfaz todas essas alterações.
- O evento inclui uma cópia do payload publicado. O payload do rascunho e o
  planejamento operacional original permanecem intactos.
- Aprovações concorrentes da mesma competência são serializadas. Uma importação
  manual ou outra versão já oficial não é substituída automaticamente.
  Repetir a requisição da versão aprovada não duplica o evento de aprovação.
- A escala oficial é localizada pelo ID gravado na versão aprovada, com conferência
  de cidade, frente, mês e aba. Não depende da posição entre as últimas 30 revisões.
- "Atualizar via API" continua sincronizando FALTA, AT, Férias, PLANTÃO e Folga
  com a oficial. A sincronização não aprova rascunhos.
- O diálogo "Escala editável" também recarrega o painel principal após sincronizar.
  Uma sincronização sem diferenças valida o vínculo e atualiza a hora da consulta,
  sem duplicar o histórico de células.

### Verificação executada

- Vitest: 44 arquivos, 285 testes aprovados.
- Edge Function: 10 testes Deno aprovados, com autenticação e Google simulados.
  Os testes rodam sem permissão de rede.
- PostgreSQL 18 temporário e isolado: 42 verificações aprovadas sobre as migrations
  reais de escalas. Cobrem permissões da RPC, aprovação, vínculo oficial, rollback
  por falha na auditoria, conflitos, repetição, cinco códigos operacionais,
  preservação do planejamento e do histórico e bloqueio de outra versão oficial.
  A autenticação usa uma estrutura mínima de teste, não uma sessão de produção.
- TypeScript do frontend e deno check da Edge: aprovados.
- Build de produção: aprovado; Vite mantém avisos de tamanho de chunks.
- ESLint dos arquivos revisados: zero erros; há um aviso de hook já existente no
  gerador. O lint global encontra problemas de formatação/CRLF em outros arquivos
  da árvore local e não foi corrigido em massa.
- Não foi executada validação ponta a ponta no ambiente publicado.

Para repetir os testes da Edge:

```powershell
npx --yes deno test --no-lock --allow-env --import-map=tests/edge/import-map.json tests/edge/schedule-operational.deno.ts
npx --yes deno check --no-lock supabase/functions/schedule-operational/index.ts
```

Para repetir o contrato SQL, use um banco PostgreSQL LOCAL, NOVO e VAZIO cujo nome
termine em _test. O runner recusa destinos remotos e não lê o .env do projeto:

```powershell
$env:SCHEDULE_PUBLICATION_TEST_URL = 'postgresql://postgres@127.0.0.1:55439/schedule_publication_test'
$env:PSQL_PATH = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
node scripts/test-schedule-publication.mjs
```

### Etapas pendentes para funcionar em produção

1. Com autorização do responsável, conferir o destino rwstmomeldwrjmczrmnp,
   o vínculo da versão 2 e a aplicação das migrations anteriores. Aplicar a
   migration 20261028170000_publish_operational_schedule.sql revisada.
2. Com autorização, implantar a Edge Function schedule-operational e o frontend.
   A versão atual da RPC de publicação recebe cinco argumentos; backend e
   migration devem ser atualizados juntos.
3. O administrador deve selecionar Natal / Controle operacional / dezembro de 2026,
   abrir o histórico, escolher a versão 2 e confirmar "Aprovar e publicar".
   Não recriar a aba Controle DEZEMBRO 26 - 5X2, que já existe.
4. Conferir a escala oficial no painel e o evento de aprovação. Após uma alteração
   operacional real autorizada no Sheets, usar "Atualizar via API" e conferir o
   painel e o histórico. Não modificar abas históricas para fazer esse teste.

A aplicação da migration e o deploy habilitam o fluxo, mas não aprovam a versão.
A aprovação permanece uma ação explícita do administrador.


## Correção 28/10/2026 — publicação retorna 403 com schema private

O diagnóstico somente de leitura confirmou que service_role pode executar as fachadas públicas de autorização, mas não tem USAGE no schema private nem EXECUTE nos três helpers que elas chamam. A RPC de publicação usa SECURITY INVOKER e depende dessa cadeia durante a sincronização. Isso causa SQLSTATE 42501 / HTTP 403 com permission denied for schema private, independentemente de alterações nas férias do Sheets.

A migration 20261028194624_schedule_private_helpers_service_role.sql concede apenas USAGE no schema e EXECUTE em private.is_admin(uuid), private.can_access_schedules(uuid) e private.can_manage_schedules(uuid) a service_role. Não torna o schema um endpoint da API, não muda os privilégios de anon/authenticated, não troca SECURITY INVOKER por DEFINER e não aprova escalas.

Validação: o teste SQL agora carrega também a migration real de hardening de 24/09, reproduz a falha antes da correção e executa os cenários de publicação, sincronização e controle de acesso após a correção, somente com dados fictícios em localhost. A migration de correção permanece local, aguardando execução autorizada no projeto remoto.

A função schedule-sync está ativa no remoto, mas sua versão publicada é anterior aos ajustes de outubro. Seu 404 é separado do erro de permissão de publicação. Após aprovar, o botão Atualizar via API do frontend atual seleciona o vínculo exato da escala oficial e usa schedule-operational. Mudanças de códigos dos dias na aba vinculada são lidas na aprovação e nas sincronizações; não é necessário desfazer as edições de férias por causa deste erro.
