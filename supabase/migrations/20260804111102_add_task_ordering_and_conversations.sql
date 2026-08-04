-- Ordem personalizada das atividades na rotina diária.
alter table public.daily_task_records
  add column display_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, scheduled_date
      order by scheduled_time, created_at, id
    )::integer - 1 as position
  from public.daily_task_records
)
update public.daily_task_records as records
set display_order = ranked.position
from ranked
where records.id = ranked.id;

create index daily_task_records_user_date_order_idx
  on public.daily_task_records (user_id, scheduled_date, display_order);

create or replace function public.reorder_daily_tasks(p_record_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  expected_count integer := cardinality(p_record_ids);
  changed_count integer;
begin
  if caller_id is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if expected_count is null or expected_count = 0 then
    return;
  end if;

  if (select count(distinct item.id) from unnest(p_record_ids) as item(id)) <> expected_count then
    raise exception 'A lista contém atividades repetidas';
  end if;

  if exists (
    select 1
    from unnest(p_record_ids) as item(id)
    left join public.daily_task_records as record on record.id = item.id
    where record.id is null or record.user_id is distinct from caller_id
  ) then
    raise exception 'Só é permitido ordenar atividades da própria rotina';
  end if;

  update public.daily_task_records as record
  set display_order = ordered.position::integer - 1
  from unnest(p_record_ids) with ordinality as ordered(id, position)
  where record.id = ordered.id
    and record.user_id = caller_id;

  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception 'Não foi possível ordenar todas as atividades';
  end if;
end;
$$;

revoke all on function public.reorder_daily_tasks(uuid[]) from public, anon;
grant execute on function public.reorder_daily_tasks(uuid[]) to authenticated;

-- Uma conversa contínua por supervisor. Gestores compartilham o mesmo histórico.
create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role public.app_role not null,
  body text not null constraint conversation_messages_body_check
    check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index conversation_messages_supervisor_created_idx
  on public.conversation_messages (supervisor_id, created_at);
create index conversation_messages_sender_idx
  on public.conversation_messages (sender_id)
  where sender_id is not null;
create index conversation_messages_unread_idx
  on public.conversation_messages (supervisor_id, created_at)
  where read_at is null;

alter table public.conversation_messages enable row level security;

revoke all on public.conversation_messages from public, anon, authenticated;
grant select, insert on public.conversation_messages to authenticated;
grant update (read_at) on public.conversation_messages to authenticated;
grant all on public.conversation_messages to service_role;

create policy "conversation_messages_select_participants"
on public.conversation_messages
for select to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    supervisor_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
);

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
    supervisor_id = (select auth.uid())
    or (
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

create policy "conversation_messages_update_participants"
on public.conversation_messages
for update to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    supervisor_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
)
with check (
  (select public.is_admin((select auth.uid())))
  or (
    supervisor_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
);

alter publication supabase_realtime add table public.conversation_messages;
