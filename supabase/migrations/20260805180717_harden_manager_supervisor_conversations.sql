-- Reaplica o isolamento para instalações onde a migration anterior já foi
-- executada manualmente ou registrada no histórico do Supabase.

drop policy if exists "conversation_messages_select_participants"
  on public.conversation_messages;
drop policy if exists "conversation_messages_insert_participants"
  on public.conversation_messages;
drop policy if exists "conversation_messages_update_participants"
  on public.conversation_messages;

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

drop function if exists public.is_conversation_participant(uuid, uuid);
