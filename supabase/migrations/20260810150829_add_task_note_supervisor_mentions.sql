-- Permite que somente o gestor marque um supervisor em uma observação da sua
-- própria rotina. O supervisor recebe uma notificação persistente contendo
-- apenas uma cópia do texto da observação, sem acesso ao registro do gestor.

alter table public.daily_task_records
  add column if not exists mentioned_supervisor_id uuid references public.profiles(id) on delete set null,
  add column if not exists mentioned_by uuid references public.profiles(id) on delete set null,
  add column if not exists mentioned_at timestamptz;

create index if not exists daily_task_records_mentioned_supervisor_idx
  on public.daily_task_records (mentioned_supervisor_id)
  where mentioned_supervisor_id is not null;

create index if not exists daily_task_records_mentioned_by_idx
  on public.daily_task_records (mentioned_by)
  where mentioned_by is not null;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('task_assigned', 'task_note_mention'));

create unique index if not exists notifications_task_note_mention_unique_idx
  on public.notifications (entity_id)
  where type = 'task_note_mention' and entity_id is not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.protect_task_note_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_role public.app_role;
  target_status public.user_status;
  mention_changed boolean := true;
begin
  if tg_op = 'UPDATE'
     and new.mentioned_supervisor_id is not distinct from old.mentioned_supervisor_id then
    -- O cliente não pode falsificar quem marcou nem o horário da marcação.
    mention_changed := false;
    new.mentioned_by := old.mentioned_by;
    new.mentioned_at := old.mentioned_at;
  end if;

  if new.mentioned_supervisor_id is null then
    new.mentioned_by := null;
    new.mentioned_at := null;
    return new;
  end if;

  if caller_id is null
     or not (select public.is_admin(caller_id))
     or new.user_id is distinct from caller_id then
    raise exception 'Somente o gestor pode marcar um supervisor em uma observação da própria rotina.'
      using errcode = '42501';
  end if;

  if nullif(btrim(new.note), '') is null then
    raise exception 'Escreva a observação antes de marcar um supervisor.'
      using errcode = '23514';
  end if;

  select p.role, p.status
  into target_role, target_status
  from public.profiles p
  where p.id = new.mentioned_supervisor_id;

  if target_role is distinct from 'supervisor'::public.app_role
     or target_status is distinct from 'active'::public.user_status then
    raise exception 'O usuário marcado precisa ser um supervisor ativo.'
      using errcode = '23514';
  end if;

  if mention_changed then
    new.mentioned_by := caller_id;
    new.mentioned_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.protect_task_note_mention()
  from public, anon, authenticated, service_role;

create trigger trg_protect_task_note_mention
before insert or update of note, mentioned_supervisor_id, mentioned_by, mentioned_at
on public.daily_task_records
for each row execute function private.protect_task_note_mention();

create or replace function private.notify_task_note_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' and new.mentioned_supervisor_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.mentioned_supervisor_id is null
     and new.mentioned_supervisor_id is null then
    return new;
  end if;

  -- A atualização original já passou pela RLS e pela proteção acima. Esta
  -- checagem mantém a função SECURITY DEFINER limitada à rotina do chamador.
  if caller_id is null
     or not (select public.is_admin(caller_id))
     or new.user_id is distinct from caller_id then
    return new;
  end if;

  delete from public.notifications
  where type = 'task_note_mention'
    and entity_id = new.id;

  if new.mentioned_supervisor_id is not null
     and new.mentioned_by = caller_id
     and nullif(btrim(new.note), '') is not null then
    insert into public.notifications (
      recipient_id,
      type,
      title,
      message,
      entity_id,
      metadata
    )
    values (
      new.mentioned_supervisor_id,
      'task_note_mention',
      'Você foi marcado em uma observação',
      btrim(new.note),
      new.id,
      jsonb_build_object(
        'record_id', new.id,
        'manager_id', caller_id,
        'scheduled_date', new.scheduled_date
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.notify_task_note_mention()
  from public, anon, authenticated, service_role;

create trigger trg_notify_task_note_mention_insert
after insert on public.daily_task_records
for each row execute function private.notify_task_note_mention();

create trigger trg_notify_task_note_mention_update
after update of note, mentioned_supervisor_id on public.daily_task_records
for each row execute function private.notify_task_note_mention();
