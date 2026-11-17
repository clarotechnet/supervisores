-- Teste isolado: todas as escritas são em pg_temp e a transação termina em ROLLBACK.
-- As funções exercitadas abaixo são cópias das definições vigentes e da migration.
begin;
create temp table profiles (like public.profiles including all);
create temp table schedule_generation_drafts (like public.schedule_generation_drafts including all);
create temp table schedule_operational_sheets (like public.schedule_operational_sheets including all);
create temp table schedule_uploads (like public.schedule_uploads including all);
create temp table schedule_operational_changes (like public.schedule_operational_changes including all);
create temp table schedule_generation_events (like public.schedule_generation_events including all);
set local search_path=pg_temp,public;
create function pg_temp.schedule_can_manage_scope(actor uuid,city text,sector text) returns boolean language sql as $$
select exists(select 1 from pg_temp.profiles where id=actor and role='admin' and status='active'); $$;
CREATE OR REPLACE FUNCTION pg_temp.schedule_operational_apply_sync(p_sheet_id uuid, p_expected_updated_at timestamp with time zone, p_actor_id uuid, p_payload jsonb, p_changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_temp'
AS $function$
declare
  v_sheet pg_temp.schedule_operational_sheets%rowtype;
  v_draft pg_temp.schedule_generation_drafts%rowtype;
  v_official pg_temp.schedule_uploads%rowtype;
  v_added jsonb;
begin
  if not exists (
    select 1 from pg_temp.profiles where id=p_actor_id
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
  select * into v_sheet from pg_temp.schedule_operational_sheets
    where id=p_sheet_id for update;
  if not found or v_sheet.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',
      message='Conflito: outra pessoa sincronizou antes; recarregue';
  end if;
  if pg_temp.schedule_can_manage_scope(p_actor_id,v_sheet.city,v_sheet.sector) is distinct from true then
    raise exception using errcode='42501',
      message='Apenas administrador pode gerenciar Controle operacional';
  end if;
  if v_sheet.deleted_at is not null or v_sheet.deletion_requested_at is not null then
    raise exception 'A escala está excluída ou em exclusão';
  end if;
  select * into v_draft from pg_temp.schedule_generation_drafts
    where id=v_sheet.draft_id for update;
  if not found or v_draft.archived_at is not null
     or v_draft.status not in ('draft','approved') then
    raise exception 'A versão selecionada não pode ser sincronizada';
  end if;
  if v_draft.city<>v_sheet.city or v_draft.sector<>v_sheet.sector
     or v_draft.schedule_month<>v_sheet.schedule_month then
    raise exception 'Escopo divergente entre versão e planilha operacional';
  end if;
  if p_payload->'dates' is distinct from v_sheet.planned_payload->'dates' then
    raise exception 'Estrutura da escala operacional alterada';
  end if;
  if v_sheet.city='natal' and v_sheet.sector='controle-operacional' then
    if v_sheet.spreadsheet_id<>'1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64' then
      raise exception 'Arquivo oficial do Controle RN inválido';
    end if;
    if jsonb_array_length(p_payload->'people') not between 1 and 500 or exists (
      select 1 from jsonb_array_elements(p_payload->'people') p
      where jsonb_typeof(p->'name') is distinct from 'string'
        or char_length(btrim(p->>'name')) not between 1 and 160
        or p->>'name' is distinct from btrim(p->>'name')
        or p->>'name' ~ '[[:cntrl:]<>]' or p->>'name' like '=%'
        or jsonb_typeof(p->'jobTitle') is distinct from 'string'
        or char_length(btrim(p->>'jobTitle')) not between 1 and 160
        or p->>'jobTitle' ~ '[[:cntrl:]<>]' or p->>'jobTitle' like '=%'
        or jsonb_typeof(p->'assignments') is distinct from 'object'
    ) or exists (
      select 1 from jsonb_array_elements(p_payload->'people') p
      group by upper(btrim(p->>'name')) having count(*)>1
    ) then
      raise exception 'Identificação ou função inválida/duplicada na escala de Controle';
    end if;
    -- Preserva tanto o planejamento original quanto inclusões já sincronizadas.
    -- Não permite renomear, retirar ou trocar o login de uma pessoa existente.
    if exists (
      select 1 from jsonb_array_elements(
        (v_sheet.planned_payload->'people') || (v_sheet.current_payload->'people')) old_person
      where not exists (
        select 1 from jsonb_array_elements(p_payload->'people') p
        where p->>'name'=old_person->>'name'
          and coalesce(p->>'login','')=coalesce(old_person->>'login','')
      )
    ) then
      raise exception 'Não é permitido remover ou renomear colaboradores já sincronizados';
    end if;
    select jsonb_agg(p order by ord) into v_added
    from jsonb_array_elements(p_payload->'people') with ordinality incoming(p,ord)
    where not exists (
      select 1 from jsonb_array_elements(v_sheet.current_payload->'people') old_person
      where old_person->>'name'=p->>'name'
    );
  elsif jsonb_array_length(p_payload->'people') <>
        jsonb_array_length(v_sheet.planned_payload->'people') then
    raise exception 'Estrutura da escala operacional alterada';
  end if;
  if v_draft.status='approved' then
    select * into v_official from pg_temp.schedule_uploads
      where id::text=v_draft.policy_snapshot->>'officialScheduleId'
        and city=v_sheet.city and sector=v_sheet.sector
        and schedule_month=v_sheet.schedule_month
        and source_file='Google Sheets - Escala operacional oficial'
        and source_sheet=v_sheet.sheet_tab for update;
    if not found then
      raise exception 'Escala oficial vinculada não encontrada: sincronização cancelada';
    end if;
    if v_official.payload is distinct from p_payload then
      update pg_temp.schedule_uploads
        set payload=p_payload,
          employee_count=jsonb_array_length(p_payload->'people'),
          entry_count=jsonb_array_length(p_payload->'people')*
            jsonb_array_length(p_payload->'dates'),
          imported_by=p_actor_id,imported_at=now()
        where id=v_official.id;
    end if;
  end if;
  update pg_temp.schedule_operational_sheets
    set current_payload=p_payload,synced_by=p_actor_id,
      last_synced_at=now(),updated_at=clock_timestamp()
    where id=p_sheet_id;
  insert into pg_temp.schedule_operational_changes(
    sheet_id,actor_id,employee_key,employee_name,duty_date,
    planned_code,previous_code,current_code)
  select p_sheet_id,p_actor_id,
    item->>'employee_key',item->>'employee_name',(item->>'duty_date')::date,
    coalesce(item->>'planned_code',''),coalesce(item->>'previous_code',''),
    coalesce(item->>'current_code','')
  from jsonb_array_elements(p_changes) item;
  if v_added is not null then
    insert into pg_temp.schedule_generation_events(draft_id,actor_id,action,changes)
    values (v_sheet.draft_id,p_actor_id,'edited',jsonb_build_object(
      'kind','employees_added_from_sheets','sheet_id',v_sheet.id,
      'employees',v_added,'employee_count',jsonb_array_length(v_added)));
  end if;
end $function$;
-- Publicação com ressalva: confirmação por administrador e auditoria na mesma transação.
-- Não altera nenhuma escala durante a instalação. As RPCs normais continuam estritas.

CREATE OR REPLACE FUNCTION pg_temp.schedule_operational_publish_checked(p_sheet_id uuid, p_actor_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_changes jsonb, p_exception jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_temp'
AS $function$
declare
  v_sheet pg_temp.schedule_operational_sheets%rowtype;
  v_draft pg_temp.schedule_generation_drafts%rowtype;
  v_existing pg_temp.schedule_uploads%rowtype;
  v_official_id uuid;
  v_count integer;
  v_date_count integer;
  v_expected_dates jsonb;
  v_exception jsonb;
begin
  if not exists (
    select 1 from pg_temp.profiles where id=p_actor_id
      and status='active' and role='admin'
  ) then
    raise exception using errcode='42501',
      message='Apenas administrador ativo pode aprovar/publicar uma escala oficial';
  end if;
  select * into v_sheet from pg_temp.schedule_operational_sheets where id=p_sheet_id;
  if not found then raise exception 'Planilha operacional não encontrada'; end if;
  -- Serializa aprovações de versões diferentes da MESMA competência.
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(v_sheet.city,v_sheet.sector,v_sheet.schedule_month)::text,0));
  select * into v_sheet from pg_temp.schedule_operational_sheets
    where id=p_sheet_id for update;
  select * into v_draft from pg_temp.schedule_generation_drafts
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
    select 1 from pg_temp.schedule_generation_drafts d
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
  select * into v_existing from pg_temp.schedule_uploads
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
  perform pg_temp.schedule_operational_apply_sync(
    p_sheet_id,p_expected_updated_at,p_actor_id,p_payload,p_changes);
  if v_draft.status='approved' then
    v_official_id := v_existing.id;
  else
  insert into pg_temp.schedule_uploads(
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
  update pg_temp.schedule_generation_drafts
    set status='approved',reviewed_by=p_actor_id,reviewed_at=now(),
      policy_snapshot=policy_snapshot || jsonb_build_object(
        'published',true,'officialScheduleId',v_official_id,
        'operationalSheetId',v_sheet.id)
    where id=v_draft.id;
  insert into pg_temp.schedule_generation_events(draft_id,actor_id,action,changes)
  values (v_draft.id,p_actor_id,'approved',jsonb_build_object(
    'sheet_id',v_sheet.id,'official_schedule_id',v_official_id,
    'tab',v_sheet.sheet_tab,'spreadsheet_id',v_sheet.spreadsheet_id,
    'revision',v_draft.revision,'employee_count',v_count,
    'published_payload',p_payload));
  end if;
  if v_exception is not null then
    update pg_temp.schedule_generation_drafts
      set policy_snapshot=policy_snapshot || jsonb_build_object('publicationException',v_exception)
      where id=v_draft.id;
    insert into pg_temp.schedule_generation_events(draft_id,actor_id,action,changes)
    values(v_draft.id,p_actor_id,'edited',jsonb_build_object(
      'kind','publication_exception_accepted','sheet_id',v_sheet.id,
      'official_schedule_id',v_official_id,'exception',v_exception));
  end if;
  return v_official_id;
end $function$;

CREATE OR REPLACE FUNCTION pg_temp.schedule_operational_publish_revision_checked(p_sheet_id uuid, p_draft_id uuid, p_actor_id uuid, p_expected_updated_at timestamp with time zone, p_planned_payload jsonb, p_payload jsonb, p_changes jsonb, p_exception jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_temp'
AS $function$
declare
 v_sheet pg_temp.schedule_operational_sheets%rowtype;
 v_previous pg_temp.schedule_generation_drafts%rowtype;
 v_selected pg_temp.schedule_generation_drafts%rowtype;
 v_official_id uuid;
begin
 if not exists(select 1 from pg_temp.profiles
   where id=p_actor_id and role='admin' and status='active') then
  raise exception using errcode='42501',message='Apenas administrador ativo pode aprovar/publicar';
 end if;
 select * into v_sheet from pg_temp.schedule_operational_sheets where id=p_sheet_id;
 if not found then raise exception 'Planilha operacional não encontrada'; end if;
 perform pg_advisory_xact_lock(hashtextextended(
  jsonb_build_array(v_sheet.city,v_sheet.sector,v_sheet.schedule_month)::text,0));
 select * into v_sheet from pg_temp.schedule_operational_sheets where id=p_sheet_id for update;
 if v_sheet.updated_at is distinct from p_expected_updated_at then
  raise exception using errcode='40001',message='Conflito: a aba mudou; recarregue antes de publicar';
 end if;
 if v_sheet.deleted_at is not null or v_sheet.deletion_requested_at is not null then
  raise exception 'A aba foi excluída ou está em exclusão';
 end if;
 select * into v_selected from pg_temp.schedule_generation_drafts where id=p_draft_id for update;
 if not found or v_selected.archived_at is not null
    or v_selected.status not in ('draft','approved') then
  raise exception 'A versão selecionada não pode ser publicada';
 end if;
 if v_selected.city<>v_sheet.city or v_selected.sector<>v_sheet.sector
    or v_selected.schedule_month<>v_sheet.schedule_month then
  raise exception 'A versão e a aba devem pertencer à mesma cidade, frente e competência';
 end if;
 if v_sheet.draft_id=p_draft_id then
  return pg_temp.schedule_operational_publish_checked(
   p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes,p_exception);
 end if;
 select * into v_previous from pg_temp.schedule_generation_drafts
  where id=v_sheet.draft_id for update;
 if not found or v_previous.status='approved' or v_selected.status<>'draft' then
  raise exception 'Uma aba de versão aprovada não pode ser transferida para outro rascunho';
 end if;
 if v_previous.city<>v_sheet.city or v_previous.sector<>v_sheet.sector
    or v_previous.schedule_month<>v_sheet.schedule_month then
  raise exception 'Vínculo anterior com escopo divergente';
 end if;
 if exists(select 1 from pg_temp.schedule_operational_sheets where draft_id=p_draft_id) then
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
 insert into pg_temp.schedule_generation_events(draft_id,actor_id,action,changes)
 values(v_previous.id,p_actor_id,'edited',jsonb_build_object(
  'kind','operational_revision_replaced','next_draft_id',v_selected.id,
  'next_revision',v_selected.revision,'previous_sheet',to_jsonb(v_sheet)));
 update pg_temp.schedule_operational_sheets
  set draft_id=v_selected.id,planned_payload=p_planned_payload where id=v_sheet.id;
 insert into pg_temp.schedule_generation_events(draft_id,actor_id,action,changes)
 values(v_selected.id,p_actor_id,'edited',jsonb_build_object(
  'kind','existing_month_tab_selected','previous_draft_id',v_previous.id,
  'previous_revision',v_previous.revision,'sheet_id',v_sheet.id,'tab',v_sheet.sheet_tab));
 -- A RPC existente valida origem oficial, avisos, concorrência e publica.
 -- Qualquer erro desfaz TAMBÉM a troca de vínculo e ambos os eventos.
 v_official_id := pg_temp.schedule_operational_publish_checked(
  p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes,p_exception);
 return v_official_id;
end $function$;

create or replace function pg_temp.schedule_operational_publish(p_sheet_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_payload jsonb, p_changes jsonb)
returns uuid language sql security invoker set search_path=pg_temp
as $function$ select pg_temp.schedule_operational_publish_checked(p_sheet_id,p_actor_id,p_expected_updated_at,p_payload,p_changes,null::jsonb); $function$;

create or replace function pg_temp.schedule_operational_publish_revision(p_sheet_id uuid, p_draft_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_planned_payload jsonb, p_payload jsonb, p_changes jsonb)
returns uuid language sql security invoker set search_path=pg_temp
as $function$ select pg_temp.schedule_operational_publish_revision_checked(p_sheet_id,p_draft_id,p_actor_id,p_expected_updated_at,p_planned_payload,p_payload,p_changes,null::jsonb); $function$;

create or replace function pg_temp.schedule_operational_publish_revision_with_exception(p_sheet_id uuid, p_draft_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_planned_payload jsonb, p_payload jsonb, p_changes jsonb, p_exception jsonb)
returns uuid language plpgsql security invoker set search_path=pg_temp
as $function$
begin
  if p_exception is null then raise exception 'Ressalva obrigatória'; end if;
  return pg_temp.schedule_operational_publish_revision_checked(p_sheet_id,p_draft_id,p_actor_id,p_expected_updated_at,p_planned_payload,p_payload,p_changes,p_exception);
end $function$;

revoke all on function pg_temp.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb) from public, anon, authenticated;
grant execute on function pg_temp.schedule_operational_publish(uuid,uuid,timestamptz,jsonb,jsonb) to service_role;
revoke all on function pg_temp.schedule_operational_publish_checked(uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function pg_temp.schedule_operational_publish_checked(uuid,uuid,timestamptz,jsonb,jsonb,jsonb) to service_role;
revoke all on function pg_temp.schedule_operational_publish_revision(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function pg_temp.schedule_operational_publish_revision(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) to service_role;
revoke all on function pg_temp.schedule_operational_publish_revision_checked(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function pg_temp.schedule_operational_publish_revision_checked(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) to service_role;
revoke all on function pg_temp.schedule_operational_publish_revision_with_exception(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function pg_temp.schedule_operational_publish_revision_with_exception(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) to service_role;


create temp table results(label text primary key);
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if;
insert into pg_temp.results values(label); end $$;
create function pg_temp.expect_error(statement text,expected text,label text) returns void language plpgsql as $$
declare message text;
begin begin execute statement; exception when others then get stacked diagnostics message=MESSAGE_TEXT; end;
if message is null or message !~* expected then raise exception 'FAIL: expected %, got %',expected,message; end if;
insert into pg_temp.results values(label); end $$;
insert into pg_temp.profiles(id,role,status) values
 ('00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000002','supervisor','active'),
 ('00000000-0000-0000-0000-000000000003','admin','pending');
with calendar as (
 select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) dates,
 jsonb_object_agg(to_char(day,'YYYY-MM-DD'),'T. 1') assignments
 from generate_series('2026-12-01'::date,'2026-12-31'::date,interval '1 day') day)
insert into pg_temp.schedule_generation_drafts(id,city,sector,schedule_month,revision,payload,created_by,warnings)
select ('10000000-0000-0000-0000-'||lpad(rev::text,12,'0'))::uuid,'natal','controle-operacional','2026-12-01',rev,
 jsonb_build_object('dates',dates,'codes','["T. 1"]'::jsonb,'people',jsonb_build_array(
 jsonb_build_object('name','TEST EMPLOYEE','jobTitle','CONTROLADOR','assignments',assignments))),
 '00000000-0000-0000-0000-000000000001','[{"level":"blocking","message":"03/01: mínimo 3, atual 2"}]'
from calendar cross join generate_series(1,2) rev;
insert into pg_temp.schedule_operational_sheets(
 id,draft_id,city,sector,schedule_month,spreadsheet_id,spreadsheet_url,sheet_tab,planned_payload,current_payload,created_by)
select '20000000-0000-0000-0000-000000000001',id,city,sector,schedule_month,
 '1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64','https://example.invalid/fixture',
 'Controle DEZEMBRO 26 - 5X2',payload,payload,created_by from pg_temp.schedule_generation_drafts where revision=1;
create temp table initial_sheet as select * from pg_temp.schedule_operational_sheets;
create function pg_temp.exception_input() returns jsonb language sql as $$
select jsonb_build_object('reason','Equipe de apoio confirmada para cobrir a diferença.',
 'acknowledged',true,'reviewToken',repeat('a',64),
 'issues','[{"id":"saved:0","source":"saved","date":null,"title":"Plantão abaixo do mínimo","detail":"03/01: mínimo 3, atual 2"}]'::jsonb,
 'draftPayload',payload,'draftWarnings',warnings,'draftPolicy',policy_snapshot)
from pg_temp.schedule_generation_drafts where revision=2; $$;
create function pg_temp.publish_case(exception jsonb default null, actor uuid default '00000000-0000-0000-0000-000000000001') returns uuid language plpgsql as $$
declare s pg_temp.schedule_operational_sheets%rowtype; d pg_temp.schedule_generation_drafts%rowtype;
begin select * into s from pg_temp.schedule_operational_sheets;
select * into d from pg_temp.schedule_generation_drafts where revision=2;
if exception is null then
 return pg_temp.schedule_operational_publish_revision(s.id,d.id,actor,s.updated_at,d.payload,s.current_payload,'[]');
end if;
return pg_temp.schedule_operational_publish_revision_with_exception(s.id,d.id,actor,s.updated_at,d.payload,s.current_payload,'[]',exception);
end $$;
select pg_temp.expect_error('select pg_temp.publish_case()','pendências','normal publication still blocks warnings');
select pg_temp.expect_error($$select pg_temp.publish_case(pg_temp.exception_input(),'00000000-0000-0000-0000-000000000002')$$,'administrador','supervisor denied');
select pg_temp.expect_error($$select pg_temp.publish_case(pg_temp.exception_input(),'00000000-0000-0000-0000-000000000003')$$,'administrador','inactive admin denied');
select pg_temp.expect_error($$select pg_temp.publish_case(jsonb_set(pg_temp.exception_input(),'{reason}','"curta"'))$$,'Justificativa','short reason denied');
select pg_temp.expect_error($$select pg_temp.publish_case(jsonb_set(pg_temp.exception_input(),'{acknowledged}','false'))$$,'confirmação','missing acknowledgment denied');
select pg_temp.expect_error($$select pg_temp.publish_case(jsonb_set(pg_temp.exception_input(),'{reviewToken}','"old"'))$$,'revisão','invalid review token denied');
select pg_temp.expect_error($$select pg_temp.publish_case(jsonb_set(pg_temp.exception_input(),'{issues}','[]'))$$,'lista','empty acceptance denied');
select pg_temp.expect_error($$select pg_temp.publish_case(jsonb_set(pg_temp.exception_input(),'{draftWarnings}','[]'))$$,'mudou','stale draft rejected under lock');
select pg_temp.expect_error($$select pg_temp.schedule_operational_publish_revision_with_exception(
 s.id,'10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
 s.updated_at-interval '1 second',s.planned_payload,s.current_payload,'[]',pg_temp.exception_input()) from pg_temp.schedule_operational_sheets s$$,'Conflito','optimistic locking preserved');
select pg_temp.assert((select s.draft_id=i.draft_id and s.updated_at=i.updated_at from pg_temp.schedule_operational_sheets s cross join pg_temp.initial_sheet i)
 and not exists(select 1 from pg_temp.schedule_uploads) and not exists(select 1 from pg_temp.schedule_generation_events),'failed acceptance preserves binding and data');
-- Simula falha no evento final para verificar rollback de sincronização, aprovação e vínculo.
alter table pg_temp.schedule_generation_events add constraint fixture_audit_failure check(coalesce(changes->>'kind','')<>'publication_exception_accepted');
select pg_temp.expect_error('select pg_temp.publish_case(pg_temp.exception_input())','fixture_audit_failure','audit failure aborts whole publication');
select pg_temp.assert((select s.draft_id=i.draft_id and s.updated_at=i.updated_at from pg_temp.schedule_operational_sheets s cross join pg_temp.initial_sheet i)
 and not exists(select 1 from pg_temp.schedule_uploads) and not exists(select 1 from pg_temp.schedule_generation_events),'audit failure rolls back all effects');
alter table pg_temp.schedule_generation_events drop constraint fixture_audit_failure;
-- Exercita exatamente as permissões usadas pela Edge Function.
do $$ begin execute format('grant usage on schema %I to service_role',pg_my_temp_schema()::regnamespace); end $$;
grant all on all tables in schema pg_temp to service_role;
grant execute on function pg_temp.publish_case(jsonb,uuid),pg_temp.exception_input() to service_role;
set local role service_role;
select pg_temp.publish_case(pg_temp.exception_input());
reset role;
select pg_temp.assert((select count(*)=1 from pg_temp.schedule_uploads),'one official created');
select pg_temp.assert((select d.status='approved' and d.warnings='[{"level":"blocking","message":"03/01: mínimo 3, atual 2"}]'::jsonb
 and d.policy_snapshot->'publicationException'->>'actorId'='00000000-0000-0000-0000-000000000001'
 and d.policy_snapshot->'publicationException'->>'reason'='Equipe de apoio confirmada para cobrir a diferença.'
 and d.policy_snapshot->'publicationException'->>'payloadMd5'=md5(s.current_payload::text)
 from pg_temp.schedule_generation_drafts d cross join pg_temp.schedule_operational_sheets s where d.revision=2),'approval retains warnings and trusted acceptance snapshot');
select pg_temp.assert((select count(*)=1 from pg_temp.schedule_generation_events where changes->>'kind'='publication_exception_accepted'),'durable exception event');
select pg_temp.assert((select count(*)=2 from pg_temp.schedule_generation_events where changes->>'kind' in ('operational_revision_replaced','existing_month_tab_selected')),'revision transfer audited atomically');
select pg_temp.expect_error('select pg_temp.publish_case()','pendências','acceptance does not waive future normal publication');
select pg_temp.assert(not has_function_privilege('authenticated',
 'pg_temp.schedule_operational_publish_revision_with_exception(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
 and not has_function_privilege('anon','pg_temp.schedule_operational_publish_checked(uuid,uuid,timestamptz,jsonb,jsonb,jsonb)','EXECUTE'),'RPCs remain service-only');
select jsonb_build_object('passed',count(*),'checks',jsonb_agg(label order by label),'writes','temporary fixtures only; rolled back') as regression from pg_temp.results;
rollback;
