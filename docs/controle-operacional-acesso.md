# Acesso autorizado ao Controle operacional

Implementação local de 28/10/2026. Ainda não habilitada em produção.

## Regra

A restrição vale exclusivamente para a frente `controle-operacional`.
As demais frentes preservam as políticas existentes e não consultam a nova API de autorização.

- Administrador ativo consulta e gerencia diretamente.
- Supervisor e Controlador ativos solicitam acesso por cidade.
- A aprovação libera somente a consulta das escalas oficiais, de todos os meses,
  naquela cidade, até revogação.
- O perfil do usuário não é alterado.
- Planejamento, rascunhos, links do Sheets, publicação e sincronização do Controle
  ficam com o administrador. Supervisores mantêm sua gestão nas outras frentes.
- Nenhum acesso é concedido pela criação das tabelas ou pelo envio do pedido.
- Revogação bloqueia novas consultas no banco mesmo com o mesmo JWT.
  A tela verifica a autorização a cada 15 segundos e ao retomar o foco;
  ao perder acesso, oculta a escala e fecha os diálogos com dados do Controle.

## Uso

O usuário escolhe Controle operacional e usa **Solicitar acesso**.
A solicitação pode incluir uma justificativa de até 500 caracteres.
Pedidos pendentes não são duplicados. Após negativa ou revogação, é possível solicitar novamente.

O administrador usa **Autorizações Controle**, na página Escalas, para aprovar consulta,
negar ou revogar. Cada decisão exige uma ação e confirmação explícitas.
A lista tem filtros, paginação e histórico; autorizações antigas continuam alcançáveis para revogação.

Pedidos, aprovações, negativas e revogações são registrados em uma trilha de auditoria.
Conflitos entre revisores são bloqueados pelo timestamp da versão consultada.
Se a gravação da auditoria falhar, a aprovação é desfeita na mesma transação.
Excluir uma conta mantém os registros de auditoria, com os vínculos pessoais removidos.

## Proteção no servidor

A migration adiciona políticas RLS **restritivas**, somadas às existentes, para:
escala oficial, observações, sugestões, regras de geração, versões,
eventos de geração, planilhas operacionais e histórico de células.
A consulta autorizada não expõe os registros privados do planejamento do Controle.

A nova Edge Function `schedule-access` valida sessão e perfil ativo.
As identidades do solicitante e do aprovador vêm da sessão autenticada.
As RPCs de solicitação/decisão usam SECURITY INVOKER e execução exclusiva de service_role.
O navegador recebe SELECT sobre seus próprios pedidos e eventos; não pode escrever nessas tabelas.

As funções `schedule-operational`, `schedule-sync` e `schedule-ai` também conferem
o escopo do usuário antes de operações do Controle, pois service_role ignora RLS.
A RPC de sincronização contém a mesma restrição de gestão.
A aba mensal do Google não é modificada por esta implementação de acesso.

## Ativação pendente — somente com autorização

Preparar as quatro funções com os arquivos desta revisão:
`schedule-access`, `schedule-operational`, `schedule-sync`, `schedule-ai`.

Ordem indicada para ativar sem deixar endpoints antigos contornarem a restrição:

1. Publicar as quatro Edge Functions atualizadas, incluindo os bloqueios de escopo.
2. Aplicar, uma vez, no projeto Supervisores `rwstmomeldwrjmczrmnp`:
   `supabase/migrations/20261028170001_control_schedule_access.sql`.
   Ela depende das migrations de escalas e de publicação anteriores.
3. Publicar o frontend atualizado.
4. Com usuários de teste autorizados, verificar solicitação, aprovação e revogação
   no ambiente publicado. Não aprovar usuários reais automaticamente.

A migration foi criada pelo CLI e ordenada após a dependência de publicação.
Nenhuma migration já aplicada anteriormente foi editada nesta mudança.
Nenhum SQL de produção, commit, push, merge ou deploy foi executado nesta revisão.

## Validação local

- 296 testes Vitest, incluindo 11 testes do fluxo/permissões de acesso.
- 28 testes Deno das Edge Functions, sem permissão de rede.
- 62 verificações SQL em PostgreSQL 18 isolado, usando as migrations reais de escalas
  e uma estrutura mínima de autenticação de teste. Incluem publicação e sincronização
  oficiais pelo administrador após as novas políticas, com preservação do histórico.
- TypeScript do frontend e deno check das quatro funções.
- ESLint dos arquivos revisados e build de produção.
- A validação ponta a ponta do ambiente publicado permanece pendente da ativação.

Para repetir os testes SQL, criar um banco LOCAL, NOVO e VAZIO cujo nome termine em _test,
definir `SCHEDULE_ACCESS_TEST_URL` e `PSQL_PATH`, e executar:

```powershell
node scripts/test-schedule-access.mjs
```

O runner recusa hosts remotos, não lê o .env do projeto e usa apenas fixtures fictícias.
