-- O supervisor nao tem acesso ao registro privado da rotina do gestor. Por isso,
-- o titulo da atividade e copiado para a notificacao no momento da marcacao.
update public.notifications as notification
set metadata = coalesce(notification.metadata, '{}'::jsonb)
  || jsonb_build_object('task_title', record.title)
from public.daily_task_records as record
where notification.type = 'task_note_mention'
  and notification.entity_id = record.id
  and coalesce(notification.metadata ->> 'task_title', '') is distinct from record.title;

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
        'scheduled_date', new.scheduled_date,
        'task_title', new.title
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.notify_task_note_mention()
  from public, anon, authenticated, service_role;
