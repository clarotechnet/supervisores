# Popup individual, leitura do Controle e exclusão de competência

O popup individual tem Anterior/Próximo na ordem da seleção visível, com contador e bloqueio nas extremidades. O estado fica no próprio popup; abrir ou navegar não renderiza novamente a matriz da página. O fundo usa escurecimento simples, sem blur, e o calendário tem rolagem própria. PDF, foco na data e observações permanecem disponíveis.

## Leitura das abas Controle

O cabeçalho mensal permanece nas linhas 1 e 2, com Nome/Função em A2/B2. A leitura aceita capitalização/acentuação equivalente no cabeçalho. Um número no lugar de Função continua sendo recusado com indicação de B2 e resposta 409. Novas abas recebem um aviso de proteção do cabeçalho; as linhas de folgas continuam editáveis.

Correções equivalentes FTA/FTZ na descrição da mesma função são sincronizadas. A comparação mantém nomes, quantidade de pessoas, datas e função operacional protegidos. O planejamento original fica intacto. Um trigger registra a função anterior e a atual em schedule_generation_events na mesma transação que atualiza a escala. Se a migration de auditoria não estiver instalada, a API recusa essa alteração.

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
