-- Notificações persistentes para tarefas avulsas delegadas pelo gestor.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null constraint notifications_type_check check (type in ('task_assigned')),
  title text not null,
  message text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Atende a busca de notificações não lidas por usuário, já na ordem da tela.
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

-- Garante somente uma notificação para cada tarefa delegada.
create unique index notifications_task_assignment_unique_idx
  on public.notifications (recipient_id, entity_id)
  where type = 'task_assigned' and entity_id is not null;

alter table public.notifications enable row level security;

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy "notifications_select_own" on public.notifications
for select to authenticated
using (
  recipient_id = (select auth.uid())
  and (select public.is_active_user((select auth.uid())))
);

create policy "notifications_update_own" on public.notifications
for update to authenticated
using (
  recipient_id = (select auth.uid())
  and (select public.is_active_user((select auth.uid())))
)
with check (
  recipient_id = (select auth.uid())
  and (select public.is_active_user((select auth.uid())))
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.notify_assigned_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  -- O INSERT original já passou pela RLS de assigned_tasks. Esta checagem adicional
  -- limita a função ao autor da atribuição, a um gestor ou a uma execução interna.
  if new.assigned_by is distinct from new.assigned_to
     and (
       caller_id is null
       or new.assigned_by = caller_id
       or (select public.is_admin(caller_id))
     ) then
    insert into public.notifications (
      recipient_id,
      type,
      title,
      message,
      entity_id,
      metadata
    )
    values (
      new.assigned_to,
      'task_assigned',
      'Nova atividade atribuída pelo gestor',
      new.title,
      new.id,
      jsonb_build_object(
        'scheduled_date', new.scheduled_date,
        'due_time', new.due_time,
        'group_name', new.group_name,
        'sector_id', new.sector_id
      )
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_assigned_task() from public, anon, authenticated;

create trigger trg_notify_assigned_task
after insert on public.assigned_tasks
for each row execute function private.notify_assigned_task();

alter publication supabase_realtime add table public.notifications;
