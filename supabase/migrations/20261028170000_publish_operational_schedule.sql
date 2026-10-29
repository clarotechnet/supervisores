-- Publicação EXPLÍCITA. Esta migration não aprova nenhuma versão.
-- Aplicar após 20261028160000_schedule_operational_shared_workbook_tabs.sql.
-- Escritas somente pela Edge autenticada; nenhuma operação escreve no Google.
begin;

create or replace function public.schedule_operational_apply_sync(
  p_sheet_id uuid, p_expected_updated_at timestamptz, p_actor_id uuid,
  p_payload jsonb, p_changes jsonb
) returns void language plpgsql security invoker set search_path=public as $$
declare
  v_sheet public.schedule_operational_sheets%rowtype;
  v_draft public.schedule_generation_drafts%rowtype;
  v_official public.schedule_uploads%rowtype;
begin
  if not exists (
    select 1 from public.profiles where id=p_actor_id
      and status='active' and role in ('admin','supervisor')
  ) then
    raise exception using errcode='42501', message='Usuário sem permissão para sincronizar';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(p_payload->'people') is distinct from 'array'
     or jsonb_typeof(p_payload->'dates') is distinct from 'array'
     or jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'Dados operacionais inválidos';
  end if;
  select * into v_sheet from public.schedule_operational_sheets
    where id=p_sheet_id for update;
  if not found or v_sheet.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',
      message='Conflito: outra pessoa sincronizou antes; recarregue';
  end if;
  select * into v_draft from public.schedule_generation_drafts
    where id=v_sheet.draft_id for update;
  if not found or v_draft.archived_at is not null
     or v_draft.status not in ('draft','approved') then
    raise exception 'A versão selecionada não pode ser sincronizada';
  end if;
  if v_draft.city<>v_sheet.city or v_draft.sector<>v_sheet.sector
     or v_draft.schedule_month<>v_sheet.schedule_month then
    raise exception 'Escopo divergente entre versão e planilha operacional';
  end if;
  -- O parser da Edge valida nomes, funções e células; SQL mantém a estrutura.
  if p_payload->'dates' is distinct from v_sheet.planned_payload->'dates'
     or jsonb_array_length(p_payload->'people') <>
        jsonb_array_length(v_sheet.planned_payload->'people') then
    raise exception 'Estrutura da escala operacional alterada';
  end if;
  if v_draft.status='approved' then
    select * into v_official from public.schedule_uploads
      where id::text=v_draft.policy_snapshot->>'officialScheduleId'
        and city=v_sheet.city and sector=v_sheet.sector
        and schedule_month=v_sheet.schedule_month
        and source_file='Google Sheets - Escala operacional oficial'
        and source_sheet=v_sheet.sheet_tab for update;
    if not found then
      raise exception 'Escala oficial vinculada não encontrada: sincronização cancelada';
    end if;
    if v_official.payload is distinct from p_payload then
      update public.schedule_uploads
        set payload=p_payload,
          employee_count=jsonb_array_length(p_payload->'people'),
          entry_count=jsonb_array_length(p_payload->'people')*
            jsonb_array_length(p_payload->'dates'),
          imported_by=p_actor_id,imported_at=now()
        where id=v_official.id;
    end if;
  end if;
  update public.schedule_operational_sheets
    set current_payload=p_payload,synced_by=p_actor_id,
      last_synced_at=now(),updated_at=clock_timestamp()
    where id=p_sheet_id;
  insert into public.schedule_operational_changes(
    sheet_id,actor_id,employee_key,employee_name,duty_date,
    planned_code,previous_code,current_code)
  select p_sheet_id,p_actor_id,
    item->>'employee_key',item->>'employee_name',(item->>'duty_date')::date,
    coalesce(item->>'planned_code',''),coalesce(item->>'previous_code',''),
    coalesce(item->>'current_code','')
  from jsonb_array_elements(p_changes) item;
end $$;

revoke all on function public.schedule_operational_apply_sync(
  uuid,timestamptz,uuid,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.schedule_operational_apply_sync(
  uuid,timestamptz,uuid,jsonb,jsonb
) to service_role;

create or replace function public.schedule_operational_publish(
  p_sheet_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz,
  p_payload jsonb, p_changes jsonb
) returns uuid language plpgsql security invoker set search_path=public as $$
declare
  v_sheet public.schedule_operational_sheets%rowtype;
  v_draft public.schedule_generation_drafts%rowtype;
  v_existing public.schedule_uploads%rowtype;
  v_official_id uuid;
  v_count integer;
  v_date_count integer;
  v_expected_dates jsonb;
begin
  if not exists (
    select 1 from public.profiles where id=p_actor_id
      and status='active' and role='admin'
  ) then
    raise exception using errcode='42501',
      message='Apenas administrador ativo pode aprovar/publicar uma escala oficial';
  end if;
  select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id;
  if not found then raise exception 'Planilha operacional não encontrada'; end if;
  -- Serializa aprovações de versões diferentes da MESMA competência.
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(v_sheet.city,v_sheet.sector,v_sheet.schedule_month)::text,0));
  select * into v_sheet from public.schedule_operational_sheets
    where id=p_sheet_id for update;
  select * into v_draft from public.schedule_generation_drafts
    where id=v_sheet.draft_id for update;
  if not found or v_draft.archived_at is not null
     or v_draft.status not in ('draft','approved') then
    raise exception 'A versão selecionada não pode ser publicada';
  end if;
  if v_sheet.city<>'natal' or v_sheet.sector<>'controle-operacional'
     or v_sheet.spreadsheet_id<>'1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64'
     or v_sheet.sheet_tab='ATUALIZADA' or v_sheet.sheet_tab is null then
    raise exception 'Vincule a versão à aba mensal do arquivo Controle RN antes de aprovar';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_draft.warnings) n
      where n->>'level'='blocking'
  ) then
    raise exception 'A versão possui pendências que impedem publicação; revise e salve outra versão';
  end if;
  if exists (
    select 1 from public.schedule_generation_drafts d
      where d.city=v_draft.city and d.sector=v_draft.sector
        and d.schedule_month=v_draft.schedule_month and d.status='approved'
        and d.id<>v_draft.id and d.archived_at is null
  ) then
    raise exception 'Já existe outra revisão aprovada nesta competência';
  end if;
  if jsonb_typeof(p_payload->'people') is distinct from 'array'
     or jsonb_typeof(p_payload->'dates') is distinct from 'array' then
    raise exception 'Escala operacional sem pessoas ou datas válidas';
  end if;
  v_count := jsonb_array_length(p_payload->'people');
  v_date_count := jsonb_array_length(p_payload->'dates');
  select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) into v_expected_dates
    from generate_series(v_sheet.schedule_month::timestamp,
      (v_sheet.schedule_month + interval '1 month - 1 day')::timestamp,
      interval '1 day') day;
  if v_count<1 or not (p_payload->'dates' @> v_expected_dates) then
    raise exception 'Escala operacional incompleta; não é possível publicar';
  end if;
  select * into v_existing from public.schedule_uploads
    where city=v_sheet.city and sector=v_sheet.sector
      and schedule_month=v_sheet.schedule_month for update;
  if found and (
    v_draft.status<>'approved'
    or v_existing.id::text is distinct from v_draft.policy_snapshot->>'officialScheduleId'
    or v_existing.source_file<>'Google Sheets - Escala operacional oficial'
    or v_existing.source_sheet<>v_sheet.sheet_tab
  ) then
    raise exception 'Já existe escala oficial de outra origem ou versão; não será substituída automaticamente';
  end if;
  if v_draft.status='approved' and v_existing.id is null then
    raise exception 'Escala oficial vinculada não encontrada';
  end if;
  -- Sincronização, auditoria, aprovação e publicação na MESMA transação.
  -- Se qualquer validação falhar, nada é alterado.
  perform public.schedule_operational_apply_sync(
    p_sheet_id,p_expected_updated_at,p_actor_id,p_payload,p_changes);
  if v_draft.status='approved' then return v_existing.id; end if;
  insert into public.schedule_uploads(
    city,sector,schedule_month,source_file,source_sheet,
    employee_count,entry_count,payload,imported_by,imported_at
  ) values (
    v_sheet.city,v_sheet.sector,v_sheet.schedule_month,
    'Google Sheets - Escala operacional oficial',v_sheet.sheet_tab,
    v_count,v_count*v_date_count,p_payload,p_actor_id,now()
  ) on conflict(city,sector,schedule_month) do nothing
  returning id into v_official_id;
  if v_official_id is null then
    raise exception 'Conflito: outra escala oficial foi publicada; recarregue';
  end if;
  update public.schedule_generation_drafts
    set status='approved',reviewed_by=p_actor_id,reviewed_at=now(),
      policy_snapshot=policy_snapshot || jsonb_build_object(
        'published',true,'officialScheduleId',v_official_id,
        'operationalSheetId',v_sheet.id)
    where id=v_draft.id;
  insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
  values (v_draft.id,p_actor_id,'approved',jsonb_build_object(
    'sheet_id',v_sheet.id,'official_schedule_id',v_official_id,
    'tab',v_sheet.sheet_tab,'spreadsheet_id',v_sheet.spreadsheet_id,
    'revision',v_draft.revision,'employee_count',v_count,
    'published_payload',p_payload));
  return v_official_id;
end $$;

revoke all on function public.schedule_operational_publish(
  uuid,uuid,timestamptz,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.schedule_operational_publish(
  uuid,uuid,timestamptz,jsonb,jsonb
) to service_role;

commit;
