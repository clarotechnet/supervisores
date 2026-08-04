create or replace function public.move_daily_task(
  p_record_id uuid,
  p_target_status public.task_status,
  p_record_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_checklist_id uuid;
  expected_count integer := cardinality(p_record_ids);
  checklist_count integer;
  changed_count integer;
begin
  if caller_id is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if p_target_status not in ('pending', 'completed', 'reopened') then
    raise exception 'Status de destino inválido';
  end if;

  select record.checklist_id
  into source_checklist_id
  from public.daily_task_records as record
  where record.id = p_record_id
    and record.user_id = caller_id;

  if source_checklist_id is null then
    raise exception 'Atividade não encontrada na rotina do usuário';
  end if;

  if expected_count is null or expected_count = 0 then
    raise exception 'A lista de atividades não pode estar vazia';
  end if;

  if (select count(distinct item.id) from unnest(p_record_ids) as item(id)) <> expected_count then
    raise exception 'A lista contém atividades repetidas';
  end if;

  if not (p_record_id = any(p_record_ids)) then
    raise exception 'A atividade movida precisa fazer parte da lista ordenada';
  end if;

  select count(*)
  into checklist_count
  from public.daily_task_records as record
  where record.checklist_id = source_checklist_id
    and record.user_id = caller_id;

  if checklist_count <> expected_count or exists (
    select 1
    from unnest(p_record_ids) as item(id)
    left join public.daily_task_records as record on record.id = item.id
    where record.id is null
      or record.user_id is distinct from caller_id
      or record.checklist_id is distinct from source_checklist_id
  ) then
    raise exception 'Só é permitido mover todas as atividades da própria rotina e data';
  end if;

  perform record.id
  from public.daily_task_records as record
  where record.id = any(p_record_ids)
  order by record.id
  for update;

  update public.daily_task_records as record
  set
    display_order = ordered.position::integer - 1,
    status = case
      when record.id = p_record_id then p_target_status
      else record.status
    end,
    completed_at = case
      when record.id <> p_record_id then record.completed_at
      when p_target_status = 'completed' then coalesce(record.completed_at, now())
      else null
    end
  from unnest(p_record_ids) with ordinality as ordered(id, position)
  where record.id = ordered.id
    and record.user_id = caller_id
    and record.checklist_id = source_checklist_id;

  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception 'Não foi possível mover e ordenar todas as atividades';
  end if;
end;
$$;

revoke all on function public.move_daily_task(uuid, public.task_status, uuid[])
  from public, anon;
grant execute on function public.move_daily_task(uuid, public.task_status, uuid[])
  to authenticated;
