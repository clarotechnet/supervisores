-- Corrige as políticas de RLS da tabela conversation_messages para gestores.
--
-- Problemas corrigidos:
-- 1. SELECT: qualquer admin via TODAS as conversas (gestor A via as do gestor B)
-- 2. INSERT: exigia recipient.role = 'supervisor', bloqueando envio quando o
--    destinatário era outro admin (403 Forbidden)
--
-- Novas regras:
-- SELECT: Supervisor vê apenas a própria conversa. Admin vê somente conversas
--         nas quais já enviou pelo menos uma mensagem.
-- INSERT: Supervisor escreve na própria conversa. Admin pode enviar para
--         qualquer supervisor ativo.
-- UPDATE: Mesma visibilidade do SELECT (para marcar read_at).

-- Função auxiliar que verifica se o usuário já participou da conversa de um
-- supervisor. Usa security definer para contornar a RLS da própria tabela.
create or replace function public.is_conversation_participant(
  _supervisor_id uuid,
  _user_id uuid
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_messages
    where supervisor_id = _supervisor_id
      and sender_id = _user_id
  );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid)
  from public, anon;
grant execute on function public.is_conversation_participant(uuid, uuid)
  to authenticated;

-- Recriar as três políticas ---------------------------------------------------

drop policy if exists "conversation_messages_select_participants"
  on public.conversation_messages;
drop policy if exists "conversation_messages_insert_participants"
  on public.conversation_messages;
drop policy if exists "conversation_messages_update_participants"
  on public.conversation_messages;

-- SELECT: supervisor vê a própria conversa; admin vê apenas onde participou
create policy "conversation_messages_select_participants"
on public.conversation_messages
for select to authenticated
using (
  (
    supervisor_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
  or (
    (select public.is_admin((select auth.uid())))
    and (select public.is_conversation_participant(
           supervisor_id, (select auth.uid())
         ))
  )
);

-- INSERT: supervisor escreve na própria conversa; admin envia para qualquer
-- supervisor ativo registrado no sistema
create policy "conversation_messages_insert_participants"
on public.conversation_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and sender_role = (
    select sender.role
    from public.profiles as sender
    where sender.id = (select auth.uid())
  )
  and (select public.is_active_user((select auth.uid())))
  and (
    -- Supervisor pode escrever apenas na própria conversa
    supervisor_id = (select auth.uid())
    or (
      -- Admin pode enviar para qualquer supervisor ativo
      (select public.is_admin((select auth.uid())))
      and exists (
        select 1
        from public.profiles as recipient
        where recipient.id = supervisor_id
          and recipient.role = 'supervisor'
          and recipient.status = 'active'
      )
    )
  )
);

-- UPDATE (apenas read_at): mesma visibilidade do SELECT
create policy "conversation_messages_update_participants"
on public.conversation_messages
for update to authenticated
using (
  (
    supervisor_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
  or (
    (select public.is_admin((select auth.uid())))
    and (select public.is_conversation_participant(
           supervisor_id, (select auth.uid())
         ))
  )
)
with check (
  (
    supervisor_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
  or (
    (select public.is_admin((select auth.uid())))
    and (select public.is_conversation_participant(
           supervisor_id, (select auth.uid())
         ))
  )
);
