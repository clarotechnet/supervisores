# Rotina de Supervisores

Aplicação web responsiva para acompanhamento das rotinas dos supervisores e do gestor. O sistema preserva as 109 atividades do HTML original, incluindo a agenda variável do MDU, e usa o Supabase como fonte oficial de autenticação, dados, histórico e atualizações em tempo real.

## Funcionalidades

- Login, confirmação de e-mail, recuperação e troca de senha.
- Cadastro público para supervisores e para o setor Gestor, sempre como `pending` e sem concessão automática de acesso administrativo.
- Aprovação, rejeição, bloqueio, troca de setor e exclusão pelo gestor.
- Setor próprio para o Gestor, com painel geral e rotina pessoal.
- Tarefas padrão por setor e tarefas avulsas. O supervisor cria apenas para si; o gestor atribui a qualquer usuário.
- Quadro e lista, atrasos, observações, reabertura e histórico.
- Visão geral com progresso por setor e detalhamento individual.
- Relatórios por período e setor, com exportação CSV.
- Supabase Realtime para checklists, registros, perfis e tarefas atribuídas.
- Popups persistentes para tarefas delegadas e alertas de atraso para o gestor.
- RLS em todas as tabelas expostas.
- Fuso oficial `America/Fortaleza`.

## Tecnologias

React 19, TypeScript, Vite, TanStack Router, Tailwind CSS 4, Supabase Auth, PostgreSQL, Row Level Security e Supabase Realtime.

## Estrutura

```text
src/
  components/        componentes visuais e quadro de tarefas
  hooks/             sessão, perfil e permissões
  integrations/      cliente e tipos do Supabase
  lib/               datas, CSV, tipos e utilitários
  routes/            login, cadastro, supervisor e administração
  services/          operações de checklist, tarefas e gestão
supabase/
  migrations/        schema, RLS, seed e evoluções
  functions/         exclusão segura de usuários
  admin-test.sql     promoção documentada do primeiro gestor
tests/               testes do seed, segurança e datas
public/.htaccess     fallback SPA para Hostinger/Apache
```

## Banco de dados

- `sectors`: seis setores operacionais e o setor `Gestor`.
- `profiles`: perfil ligado a `auth.users`, setor, papel e situação.
- `task_templates`: 109 atividades padrão com horários, ordem e dias da semana.
- `assigned_tasks`: tarefas avulsas criadas para o próprio usuário ou delegadas pelo gestor.
- `notifications`: avisos persistentes e não lidos de tarefas delegadas.
- `daily_checklists`: um checklist por usuário e data.
- `daily_task_records`: cópia histórica das atividades daquele dia.
- `audit_logs`: conclusões, reaberturas, observações e ações administrativas.

Os registros diários guardam título, grupo e horário como uma fotografia. Assim, editar ou desativar uma atividade padrão não altera o histórico.

## Checklist de validação manual

1. Cadastro de supervisor e confirmação de e-mail.
2. Bloqueio na tela de espera antes da aprovação.
3. Aprovação pelo gestor e login.
4. Recuperação e troca de senha.
5. Supervisor vendo somente perfil, setor, checklist e histórico próprios.
6. Tentativa de consultar outro setor diretamente pela API sendo negada pela RLS.
7. Gestor vendo todos os setores e o detalhe de cada supervisor.
8. Conclusão, horário, observação, reabertura e auditoria.
9. Atualização em tempo real no painel geral.
10. Agenda do MDU em cada dia da semana.
11. Supervisor criando tarefa apenas para si.
12. Gestor atribuindo tarefa a si e a outro supervisor.
13. Popup de nova tarefa para o supervisor e alerta de atraso para o gestor.
14. Exclusão de usuário pela Edge Function.
15. Exportação CSV e responsividade em celular.

## Segurança

Autorização é baseada exclusivamente em `profiles.role`, `profiles.status` e `profiles.sector_id`. `user_metadata` é usado apenas para capturar nome e setor solicitado no cadastro; nunca decide acesso. Todas as políticas combinam o papel autenticado com propriedade, setor ou permissão administrativa.
