# Popup individual, leitura do Controle e exclusão de competência

O popup individual tem Anterior/Próximo na ordem da seleção visível, com contador e bloqueio nas extremidades. O estado fica no próprio popup; abrir ou navegar não renderiza novamente a matriz da página. O fundo usa escurecimento simples, sem blur, e o calendário tem rolagem própria. PDF, foco na data e observações permanecem disponíveis.

## Leitura das abas Controle

O cabeçalho mensal permanece nas linhas 1 e 2, com Nome/Função em A2/B2. A leitura aceita capitalização/acentuação equivalente no cabeçalho. Um número no lugar de Função continua sendo recusado com indicação de B2 e resposta 409. Novas abas recebem um aviso de proteção do cabeçalho; as linhas de folgas continuam editáveis.

Funções e bases editadas na coluna B do Controle mensal são sincronizadas por ação de administrador ativo, incluindo ajustes de Apoio, cidade, descrição e FTA/FTZ. Nomes, quantidade de pessoas e datas continuam protegidos; funções precisam ser textos válidos de 1 a 160 caracteres. O planejamento original fica intacto. Um trigger registra a função anterior e a atual em schedule_generation_events na mesma transação que atualiza a escala. Se a auditoria não estiver instalada, a API recusa essa alteração. As demais origens mantêm a validação anterior de função.

## Exclusão de uma escala oficial

Administrador ativo: Ações → Excluir escala e aba no Sheets. O diálogo confere o vínculo, mostra a aba e exige EXCLUIR AAAA-MM.

A API remove somente o gid mensal registrado no arquivo regional configurado. ATUALIZADA, abas históricas, arquivos diferentes, abas renomeadas ou recriadas com outro gid são recusados. O arquivo Google inteiro nunca é excluído.

O banco registra primeiro a intenção e snapshots da escala, versão e conteúdo Google, incluindo alterações ainda não sincronizadas. Depois a API remove a aba, confirma sua ausência e conclui a retirada do painel. Notas, versões e eventos ficam no histórico. A revisão é marcada como rejeitada/excluída; não volta a ser fonte oficial. Uma nova revisão pode reutilizar o nome da aba e depende de aprovação explícita para publicação.

Enquanto a exclusão estiver pendente, sincronização e edição daquela versão ficam bloqueadas. Se o Google tiver removido a aba e a conclusão no banco falhar, a interface informa a situação; repetir a exclusão conclui o mesmo pedido sem apagar outra aba. Importações legadas continuam com o fluxo de exclusão da importação; suas abas históricas não são apagadas.

## Ativação

1. Revisar e aplicar supabase/migrations/20261029132008_schedule_month_deletion.sql no projeto rwstmomeldwrjmczrmnp. Esse SQL cria estrutura, permissões, proteção e auditoria; não exclui, aprova ou publica nenhuma escala.
2. Implantar schedule-operational e schedule-edit atualizadas.
3. Atualizar o frontend.
4. Atualizar dezembro via API para carregar as alterações do Sheets.
5. Para refazer janeiro, selecionar janeiro e usar a exclusão explícita; gerar a nova prévia a partir de dezembro sincronizado, revisar, salvar outra versão e aprovar somente por decisão da gestão.

Comandos de deploy (somente com autorização):

```powershell
npx supabase functions deploy schedule-operational --project-ref rwstmomeldwrjmczrmnp
npx supabase functions deploy schedule-edit --project-ref rwstmomeldwrjmczrmnp
```

## Validação

347 testes Vitest, 61 testes Deno, TypeScript do frontend e das duas funções, lint dos arquivos alterados e build verificados. O teste PostgreSQL local usa um banco novo e vazio terminado em _test e executa 117 verificações com as migrations reais. Nunca usa o projeto vinculado.

A interface foi verificada no navegador com dados fictícios: navegar não alterou o contador de renderizações da página; os extremos da fila foram respeitados; o popup coube em 390 × 844 sem overflow horizontal; a exclusão só foi habilitada pela confirmação da competência correta.

Nenhuma exclusão real, publicação de escala ou migration de produção foi executada na validação.

## Cabeçalho mensal como texto ou data

B1 aceita texto de competência (por exemplo, DEZEMBRO 26 ou dezembro 2026) e uma data do mesmo mês/ano, inclusive o número serial devolvido por valueRenderOption=UNFORMATTED_VALUE. A data 01/12/2026 tem serial 46357 e pode ser exibida como dezembro 26 sem invalidar a sincronização. Datas textuais BR/ISO e competência AAAA-MM também são reconhecidas; outro mês/ano, valor inválido ou data inexistente são recusados.

A1 continua sendo o rótulo Mês-ano:, A2/B2 continuam Nome/Função e as datas/identidades da escala mantêm sua validação. Essa correção não altera o Sheets nem aplica sincronização/publicação em produção. Para ativar, implantar schedule-operational e schedule-edit, pois ambas usam o parser compartilhado. Não há SQL novo nesta correção.

Validação desta correção: 44 testes Vitest relacionados, 70 testes Deno das Edge Functions, TypeScript, Deno check de schedule-operational/schedule-edit, ESLint e build passaram. Nenhum deploy ou atualização de dados de produção foi executado.

## Reordenação das linhas no Controle

A aba mensal pode ser organizada em outra ordem, desde que cada linha inteira continue ligada ao mesmo nome cadastrado. A leitura associa as linhas pelo nome exato, reconstrói o payload na ordem original do planejamento e mantém os códigos e registros de alteração vinculados à pessoa. A identificação interna não depende do número da linha no Sheets.

Nomes duplicados, desconhecidos, vazios, quantidade de colaboradores diferente, datas alteradas e funções vazias ou inválidas continuam bloqueados antes da sincronização. Reordenar sem mudar os dias ou funções não gera alterações de escala. As alterações de função mantêm a exigência da auditoria transacional existente.

O editor localiza a célula pela pessoa e pela data; a regressão confere sua coordenada física após reordenar as linhas. A busca exclui as colunas Nome/Login/Função, para que uma data nativa em B1 não seja confundida com a coluna do dia 01/12. Não há alteração de layout, SQL novo ou publicação automática. Ativação: implantar novamente schedule-operational e schedule-edit, pois ambas usam os parsers compartilhados, e então testar Atualizar via API em dezembro.

Validação da reordenação: 66 testes Vitest relacionados, 72 testes Deno, TypeScript, Deno check de schedule-operational/schedule-edit, ESLint dos arquivos alterados e build passaram. git diff --check sem erros. Os testes verificam atribuição dos códigos e da auditoria à pessoa correta, repetição sem novas alterações, proteção contra nomes inválidos e coordenadas de edição após reordenação com B1 numérico. Nenhuma sincronização, aprovação, publicação ou escrita no Google/produção foi executada nesta correção.

## Sincronização de funções e bases do Controle

A validação da função no planejamento não pode impedir mudanças feitas na coluna B da aba oficial. Exemplo: CONTROLADOR (ADESÃO APOIO)-FTZ-MSRO pode passar a CONTROLADOR (ADESÃO) - FTZ - APOIO. O nome identifica a mesma pessoa; a nova descrição entra no payload atual, e o planejamento e as versões anteriores permanecem intactos. A regra fica restrita ao Controle mensal, cujo gerenciamento exige administrador ativo.

A resposta da API informa changes como o total de mudanças de dias e funções, discriminadas em cellChanges e functionChanges. Uma atualização somente de função também informa auditLogged=true e aparece como alteração na interface existente. A edição de um dia verifica a estrutura e a disponibilidade da auditoria antes de gravar no Google; quando a escala é oficial, lê somente a aba vinculada.

Foi executada uma simulação local com a leitura atual da aba e os snapshots do banco: 42 colaboradores, 37 datas, 139 mudanças de células e 16 de funções. O parser preservou o planejamento e não gerou novas alterações ao repetir a mesma leitura. A auditoria instalada no banco foi confirmada em consulta de leitura. A simulação não chamou sincronização/publicação nem gravou no Google ou no banco.

Ativação desta correção: publicar novamente schedule-operational e schedule-edit e testar Atualizar via API. Não há migration nova nem alteração de frontend necessária.

Validação de funções/bases: suíte completa com 431 testes Vitest em 54 arquivos e 77 testes Deno aprovada; TypeScript, Deno check das duas funções, ESLint dos arquivos alterados, build e git diff --check sem erros. Os testes cobrem mudanças só de função, função com marcação, acesso restrito, auditoria ausente antes de gravar, edição na célula física correta após reordenação e bloqueio de identificação desconhecida. A simulação real permaneceu em 139 células/16 funções, com planejamento preservado e repetição sem novas alterações. Nenhum deploy, commit ou gravação de dados de produção foi feito.

## Excluir rascunho no gerador

A lista de versões mostra Excluir rascunho para versões em draft e, para administradores, também em rejected. Uma exclusão oficial marca a versão anterior como rejected; ocultar o botão nesse estado impedia limpar essa versão da lista. O status aparece em português como Rejeitado.

A remoção continua sendo arquivamento com archived_at/archived_by, sem apagar a versão, o payload, os eventos ou vínculos. O usuário confirma antes de remover. Versões approved não têm esse botão; o serviço também as recusa, e filtra o status original na atualização para não arquivar uma versão aprovada enquanto a lista estava aberta. As permissões RLS existentes continuam sendo aplicadas.

Validação: 18 testes de arquivamento/serviços, TypeScript, ESLint e build passaram. O navegador com dados fictícios mostrou o botão para draft/rejected e sua ausência para approved; a confirmação nativa foi aberta, mas a automação do navegador parou de responder nessa etapa, sem concluir a exclusão visual. Nenhum rascunho real foi removido. A consulta de leitura confirmou que a política existente permite ao administrador arquivar a versão rejeitada; não há SQL novo nem Edge Function para implantar. Atualizar/recarregar o frontend ativa a alteração.
