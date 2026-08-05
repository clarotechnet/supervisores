-- Separa definitivamente as conversas pelo par gestor + supervisor.
--
-- Antes, todas as mensagens de um supervisor ficavam no mesmo canal porque
-- a tabela possuía apenas supervisor_id. A existência de uma única mensagem
-- enviada por um gestor fazia a política antiga liberar todo o histórico desse
-- supervisor, inclusive mensagens de outros gestores.

alter table public.conversation_messages
  add column if not exists manager_id uuid references public.profiles(id) on delete cascade;

-- Recupera o gestor das mensagens que já foram enviadas por administradores.
update public.conversation_messages
set manager_id = sender_id
where manager_id is null
  and sender_role = 'admin'
  and sender_id is not null;

-- Para respostas antigas do supervisor, associa ao último gestor que havia
-- falado antes naquela conversa. Caso não exista, tenta o primeiro gestor que
-- falou depois. Isso preserva o máximo possível do histórico legado.
update public.conversation_messages as message
set manager_id = coalesce(
  (
    select previous_message.sender_id
    from public.conversation_messages as previous_message
    where previous_message.supervisor_id = message.supervisor_id
      and previous_message.sender_role = 'admin'
      and previous_message.sender_id is not null
      and previous_message.created_at <= message.created_at
    order by previous_message.created_at desc, previous_message.id desc
    limit 1
  ),
  (
    select next_message.sender_id
    from public.conversation_messages as next_message
    where next_message.supervisor_id = message.supervisor_id
      and next_message.sender_role = 'admin'
      and next_message.sender_id is not null
      and next_message.created_at > message.created_at
    order by next_message.created_at asc, next_message.id asc
    limit 1
  )
)
where message.manager_id is null
  and message.sender_role = 'supervisor';

create index if not exists conversation_messages_pair_created_idx
  on public.conversation_messages (supervisor_id, manager_id, created_at);

create index if not exists conversation_messages_manager_created_idx
  on public.conversation_messages (manager_id, created_at)
  where manager_id is not null;

-- NOT VALID mantém mensagens legadas sem gestor identificável, mas passa a
-- impedir novas mensagens sem manager_id.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_messages_manager_required'
      and conrelid = 'public.conversation_messages'::regclass
  ) then
    alter table public.conversation_messages
      add constraint conversation_messages_manager_required
      check (manager_id is not null) not valid;
  end if;
end;
$$;

-- Remove as políticas que usavam somente supervisor_id.
drop policy if exists "conversation_messages_select_participants"
  on public.conversation_messages;
drop policy if exists "conversation_messages_insert_participants"
  on public.conversation_messages;
drop policy if exists "conversation_messages_update_participants"
  on public.conversation_messages;

-- Gestor vê somente as mensagens em que ele próprio é manager_id.
-- Supervisor vê somente conversas em que ele próprio é supervisor_id.
create policy "conversation_messages_select_participants"
on public.conversation_messages
for select to authenticated
using (
  (select public.is_active_user((select auth.uid())))
  and manager_id is not null
  and (
    supervisor_id = (select auth.uid())
    or (
      manager_id = (select auth.uid())
      and (select public.is_admin((select auth.uid())))
    )
  )
);

-- O par gestor + supervisor é obrigatório e não pode ser falsificado.
create policy "conversation_messages_insert_participants"
on public.conversation_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and manager_id is not null
  and sender_role = (
    select sender.role
    from public.profiles as sender
    where sender.id = (select auth.uid())
  )
  and (select public.is_active_user((select auth.uid())))
  and (
    (
      sender_role = 'supervisor'
      and supervisor_id = (select auth.uid())
      and (select public.is_admin(manager_id))
    )
    or
    (
      sender_role = 'admin'
      and manager_id = (select auth.uid())
      and (select public.is_admin((select auth.uid())))
      and exists (
        select 1
        from public.profiles as supervisor
        where supervisor.id = supervisor_id
          and supervisor.role = 'supervisor'
          and supervisor.status = 'active'
      )
    )
  )
);

-- O usuário só pode marcar como lida uma mensagem do seu próprio par.
create policy "conversation_messages_update_participants"
on public.conversation_messages
for update to authenticated
using (
  (select public.is_active_user((select auth.uid())))
  and manager_id is not null
  and (
    supervisor_id = (select auth.uid())
    or (
      manager_id = (select auth.uid())
      and (select public.is_admin((select auth.uid())))
    )
  )
)
with check (
  (select public.is_active_user((select auth.uid())))
  and manager_id is not null
  and (
    supervisor_id = (select auth.uid())
    or (
      manager_id = (select auth.uid())
      and (select public.is_admin((select auth.uid())))
    )
  )
);

-- Lista somente os gestores com os quais o supervisor autenticado já possui
-- uma conversa. A função retorna o nome sem abrir a tabela profiles inteira.
create or replace function public.list_my_conversation_managers()
returns table (
  manager_id uuid,
  manager_name text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    messages.manager_id,
    manager.full_name as manager_name,
    max(messages.created_at) as last_message_at,
    count(*) filter (
      where messages.read_at is null
        and messages.sender_id is distinct from (select auth.uid())
    ) as unread_count
  from public.conversation_messages as messages
  join public.profiles as manager on manager.id = messages.manager_id
  where messages.supervisor_id = (select auth.uid())
    and messages.manager_id is not null
    and manager.role = 'admin'
    and manager.status = 'active'
    and (select public.is_active_user((select auth.uid())))
  group by messages.manager_id, manager.full_name
  order by max(messages.created_at) desc;
$$;

revoke all on function public.list_my_conversation_managers()
  from public, anon;
grant execute on function public.list_my_conversation_managers()
  to authenticated;

-- A função antiga não representa mais participação corretamente, pois não
-- considera manager_id.
drop function if exists public.is_conversation_participant(uuid, uuid);
