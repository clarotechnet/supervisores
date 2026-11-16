-- Publicação com ressalva: confirmação por administrador e auditoria na mesma transação.
-- Não altera nenhuma escala durante a instalação. As RPCs normais continuam estritas.
begin;

CREATE OR REPLACE FUNCTION public.schedule_operational_publish_checked(p_sheet_id uuid, p_actor_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_changes jsonb, p_exception jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_sheet public.schedule_operational_sheets%rowtype;
  v_draft public.schedule_generation_drafts%rowtype;
  v_existing public.schedule_uploads%rowtype;
  v_official_id uuid;
  v_count integer;
  v_date_count integer;
  v_expected_dates jsonb;
  v_exception jsonb;
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
  if p_exception is not null then
    if jsonb_typeof(p_exception) is distinct from 'object'
       or jsonb_typeof(p_exception->'reason') is distinct from 'string'
       or char_length(btrim(p_exception->>'reason')) not between 20 and 2000
       or p_exception->'acknowledged' is distinct from 'true'::jsonb
       or coalesce(p_exception->>'reviewToken','') !~ '^[a-f0-9]{64}$'
       or jsonb_typeof(p_exception->'issues') is distinct from 'array' then
      raise exception 'Justificativa, confirmação e revisão das pendências são obrigatórias';
    end if;
    if jsonb_array_length(p_exception->'issues') not between 1 and 500
       or exists(select 1 from jsonb_array_elements(p_exception->'issues') item
         where jsonb_typeof(item) is distinct from 'object'
           or coalesce(item->>'source','') not in ('saved','sheet')
           or jsonb_typeof(item->'id') is distinct from 'string'
           or char_length(coalesce(item->>'id','')) not between 1 and 200
           or jsonb_typeof(item->'title') is distinct from 'string'
           or char_length(coalesce(item->>'title','')) not between 1 and 240
           or jsonb_typeof(item->'detail') is distinct from 'string'
           or char_length(coalesce(item->>'detail','')) not between 1 and 4000) then
      raise exception 'A lista de pendências aceitas é inválida';
    end if;
    -- A leitura no Google ocorre fora da transação. Revalida o rascunho sob lock.
    if p_exception->'draftPayload' is distinct from v_draft.payload
       or p_exception->'draftWarnings' is distinct from v_draft.warnings
       or p_exception->'draftPolicy' is distinct from v_draft.policy_snapshot then
      raise exception using errcode='40001',
        message='A versão mudou após a revisão; confira as pendências novamente';
    end if;
    v_exception := jsonb_build_object(
      'reason',btrim(p_exception->>'reason'),'acknowledged',true,
      'reviewToken',p_exception->>'reviewToken','issues',p_exception->'issues',
      'actorId',p_actor_id,'acceptedAt',now(),'sheetId',v_sheet.id,
      'draftId',v_draft.id,'month',v_sheet.schedule_month,
      'savedWarnings',v_draft.warnings,'payloadMd5',md5(p_payload::text));
  end if;
  if v_sheet.sheet_tab is null or v_sheet.sheet_tab='ATUALIZADA'
     or not (
       (v_sheet.city='natal' and v_sheet.sector in ('adesao-servico','mdu','vt','construcao','desconexao','controle-operacional'))
       or (v_sheet.city='mossoro' and v_sheet.sector='mossoro')
       or (v_sheet.city='fortaleza' and v_sheet.sector in ('instalacao','manutencao','desconexao','supervisao'))
       or (v_sheet.city='recife' and v_sheet.sector in ('instalacao','desconexao'))
     ) then
    raise exception 'Vincule a versão à aba mensal do Sheets oficial antes de aprovar';
  end if;
  if v_sheet.sector='controle-operacional' and
     (v_sheet.city<>'natal' or v_sheet.spreadsheet_id<>'1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64') then
    raise exception 'Arquivo oficial do Controle RN inválido';
  end if;
  if p_exception is null and exists (
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
  if v_draft.status='approved' then
    v_official_id := v_existing.id;
  else
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
  end if;
  if v_exception is not null then
    update public.schedule_generation_drafts
      set policy_snapshot=policy_snapshot || jsonb_build_object('publicationException',v_exception)
      where id=v_draft.id;
    insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
    values(v_draft.id,p_actor_id,'edited',jsonb_build_object(
      'kind','publication_exception_accepted','sheet_id',v_sheet.id,
      'official_schedule_id',v_official_id,'exception',v_exception));
  end if;
  return v_official_id;
end $function$;

CREATE OR REPLACE FUNCTION public.schedule_operational_publish_revision_checked(p_sheet_id uuid, p_draft_id uuid, p_actor_id uuid, p_expected_updated_at timestamp with time zone, p_planned_payload jsonb, p_payload jsonb, p_changes jsonb, p_exception jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
 v_sheet public.schedule_operational_sheets%rowtype;
 v_previous public.schedule_generation_drafts%rowtype;
 v_selected public.schedule_generation_drafts%rowtype;
 v_official_id uuid;
begin
 if not exists(select 1 from public.profiles
   where id=p_actor_id and role='admin' and status='active') then
  raise exception using errcode='42501',message='Apenas administrador ativo pode aprovar/publicar';
 end if;
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id;
 if not found then raise exception 'Planilha operacional não encontrada'; end if;
 perform pg_advisory_xact_lock(hashtextextended(
  jsonb_build_array(v_sheet.city,v_sheet.sector,v_sheet.schedule_month)::text,0));
 select * into v_sheet from public.schedule_operational_sheets where id=p_sheet_id for update;
 if v_sheet.updated_at is distinct from p_expected_updated_at then
  raise exception using errcode='40001',message='Conflito: a aba mudou; recarregue antes de publicar';
 end if;
 if v_sheet.deleted_at is not null or v_sheet.deletion_requested_at is not null then
  raise exception 'A aba foi excluída ou está em exclusão';
 end if;
 select * into v_selected from public.schedule_generation_drafts where id=p_draft_id for update;
 if not found or v_selected.archived_at is not null
    or v_selected.status not in ('draft','approved') then
  raise exception 'A versão selecionada não pode ser publicada';
 end if;
 if v_selected.city<>v_sheet.city or v_selected.sector<>v_sheet.sector
    or v_selected.schedule_month<>v_sheet.schedule_month then
  raise exception 'A versão e a aba devem pertencer à mesma cidade, frente e competência';
 end if;
 if v_sheet.draft_id=p_draft_id then
  return public.schedule_operational_publish_checked(
   p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes,p_exception);
 end if;
 select * into v_previous from public.schedule_generation_drafts
  where id=v_sheet.draft_id for update;
 if not found or v_previous.status='approved' or v_selected.status<>'draft' then
  raise exception 'Uma aba de versão aprovada não pode ser transferida para outro rascunho';
 end if;
 if v_previous.city<>v_sheet.city or v_previous.sector<>v_sheet.sector
    or v_previous.schedule_month<>v_sheet.schedule_month then
  raise exception 'Vínculo anterior com escopo divergente';
 end if;
 if exists(select 1 from public.schedule_operational_sheets where draft_id=p_draft_id) then
  raise exception 'A versão selecionada já possui outra aba vinculada';
 end if;
 if p_exception is null and exists(select 1 from jsonb_array_elements(v_selected.warnings) n
   where n->>'level'='blocking') then
  raise exception 'A versão possui pendências que impedem publicação';
 end if;
 if jsonb_typeof(p_planned_payload->'dates') is distinct from 'array'
    or jsonb_typeof(p_planned_payload->'people') is distinct from 'array'
    or not ((p_planned_payload->'dates') @> (v_selected.payload->'dates'))
    or jsonb_array_length(p_planned_payload->'people') <>
       jsonb_array_length(v_selected.payload->'people')
    or exists(
     select 1 from jsonb_array_elements(v_selected.payload->'people') person
     where not exists(
      select 1 from jsonb_array_elements(p_planned_payload->'people') planned
      where planned->>'name'=person->>'name'
       and planned->>'jobTitle'=person->>'jobTitle'
       and (planned->'assignments') @> (person->'assignments')
     )
    ) then
  raise exception 'O planejamento não corresponde à versão selecionada';
 end if;
 -- O registro operacional e sua auditoria de células mantêm o mesmo ID.
 -- A fotografia completa do vínculo anterior permanece no histórico da versão anterior.
 insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
 values(v_previous.id,p_actor_id,'edited',jsonb_build_object(
  'kind','operational_revision_replaced','next_draft_id',v_selected.id,
  'next_revision',v_selected.revision,'previous_sheet',to_jsonb(v_sheet)));
 update public.schedule_operational_sheets
  set draft_id=v_selected.id,planned_payload=p_planned_payload where id=v_sheet.id;
 insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
 values(v_selected.id,p_actor_id,'edited',jsonb_build_object(
  'kind','existing_month_tab_selected','previous_draft_id',v_previous.id,
  'previous_revision',v_previous.revision,'sheet_id',v_sheet.id,'tab',v_sheet.sheet_tab));
 -- A RPC existente valida origem oficial, avisos, concorrência e publica.
 -- Qualquer erro desfaz TAMBÉM a troca de vínculo e ambos os eventos.
 v_official_id := public.schedule_operational_publish_checked(
  p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes,p_exception);
 return v_official_id;
end $function$;

create or replace function public.schedule_operational_publish(p_sheet_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_payload jsonb, p_changes jsonb)
returns uuid language sql security invoker set search_path=public
as $function$ select public.schedule_operational_publish_checked(p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes,null::jsonb); $function$;

create or replace function public.schedule_operational_publish_revision(p_sheet_id uuid, p_draft_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_planned_payload jsonb, p_payload jsonb, p_changes jsonb)
returns uuid language sql security invoker set search_path=public
as $function$ select public.schedule_operational_publish_revision_checked(p_sheet_id,p_draft_id,p_actor_id,p_expected_updated_at,p_planned_payload,p_payload,p_changes,null::jsonb); $function$;

create or replace function public.schedule_operational_publish_revision_with_exception(p_sheet_id uuid, p_draft_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_planned_payload jsonb, p_payload jsonb, p_changes jsonb, p_exception jsonb)
returns uuid language plpgsql security invoker set search_path=public
as $function$
begin
  if p_exception is null then raise exception 'Ressalva obrigatória'; end if;
  return public.schedule_operational_publish_revision_checked(p_sheet_id,p_draft_id,p_actor_id,p_expected_updated_at,p_planned_payload,p_payload,p_changes,p_exception);
end $function$;

revoke all on function public.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb) to service_role;
revoke all on function public.schedule_operational_publish_checked(uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.schedule_operational_publish_checked(uuid,uuid,timestamptz,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.schedule_operational_publish_revision(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.schedule_operational_publish_revision(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.schedule_operational_publish_revision_checked(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.schedule_operational_publish_revision_checked(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.schedule_operational_publish_revision_with_exception(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.schedule_operational_publish_revision_with_exception(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
