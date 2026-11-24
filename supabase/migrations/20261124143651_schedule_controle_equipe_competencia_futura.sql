-- Controle RN: sincroniza a equipe somente da competência futura selecionada.
-- Instalar esta migration não altera a escala, a planilha ou o histórico existente.
begin;

alter table public.schedule_operational_sheets
  add column removed_roster_names text[] not null default '{}';

-- Só a sincronização explícita do Sheets fornece a lista de saídas. Chamadas
-- antigas, edição de célula e publicação continuam sem essa autorização.
create function public.schedule_operational_apply_roster_sync(
  p_sheet_id uuid, p_expected_updated_at timestamptz, p_actor_id uuid,
  p_payload jsonb, p_changes jsonb, p_removed_names text[]
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_sheet public.schedule_operational_sheets%rowtype;
  v_draft public.schedule_generation_drafts%rowtype;
  v_official public.schedule_uploads%rowtype;
  v_added jsonb;
  v_removed jsonb;
  v_removed_names text[];
  v_inactive_names text[];
  v_logins jsonb;
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
     or jsonb_typeof(p_changes) is distinct from 'array' or p_removed_names is null then
    raise exception 'Dados operacionais inválidos';
  end if;
  select * into v_sheet from public.schedule_operational_sheets
    where id=p_sheet_id for update;
  if not found or v_sheet.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',
      message='Conflito: outra pessoa sincronizou antes; recarregue';
  end if;
  if public.schedule_can_manage_scope(p_actor_id,v_sheet.city,v_sheet.sector) is distinct from true then
    raise exception using errcode='42501',
      message='Apenas administrador pode gerenciar Controle operacional';
  end if;
  if v_sheet.deleted_at is not null or v_sheet.deletion_requested_at is not null then
    raise exception 'A escala está excluída ou em exclusão';
  end if;
  select * into v_draft from public.schedule_generation_drafts
    where id=v_sheet.draft_id for update;
  if not found or v_draft.archived_at is not null or v_draft.status not in ('draft','approved') then
    raise exception 'A versão selecionada não pode ser sincronizada';
  end if;
  if v_draft.city<>v_sheet.city or v_draft.sector<>v_sheet.sector
     or v_draft.schedule_month<>v_sheet.schedule_month then
    raise exception 'Escopo divergente entre versão e planilha operacional';
  end if;
  if p_payload->'dates' is distinct from v_sheet.planned_payload->'dates' then
    raise exception 'Estrutura da escala operacional alterada';
  end if;
  v_inactive_names := v_sheet.removed_roster_names;
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
    select jsonb_object_agg(p->>'name', coalesce(p->>'login','')) into v_logins
      from jsonb_array_elements(p_payload->'people') p;
    if exists (
      select 1 from jsonb_array_elements(
        (v_sheet.planned_payload->'people') || (v_sheet.current_payload->'people')) old_person
      where v_logins ? (old_person->>'name')
        and (v_logins->>(old_person->>'name')) is distinct from coalesce(old_person->>'login','')
    ) then
      raise exception 'Não é permitido trocar o login de colaboradores já sincronizados';
    end if;
    -- A equipe já publicada tem prioridade no registro da saída. Só deixa de
    -- exigir uma pessoa do planejamento se ela já tiver saída nesta mesma aba.
    select jsonb_agg(p order by p->>'name'), coalesce(array_agg(p->>'name'), '{}')
      into v_removed, v_removed_names
      from (
        select distinct on (p->>'name') p from (
          select p, 0 as priority from jsonb_array_elements(v_sheet.current_payload->'people') p
          union all
          select p, 1 from jsonb_array_elements(v_sheet.planned_payload->'people') p
            where not ((p->>'name') = any(v_sheet.removed_roster_names))
        ) as expected_roster
        where not (v_logins ? (p->>'name'))
        order by p->>'name', priority
      ) as absent;
    if cardinality(v_removed_names) > 0 then
      if cardinality(p_removed_names) = 0 then
        raise exception 'Não é permitido remover ou renomear colaboradores já sincronizados por esta ação';
      end if;
      if v_sheet.schedule_month < (
        date_trunc('month', timezone('America/Sao_Paulo', clock_timestamp())) + interval '1 month'
      )::date then
        raise exception 'Só é permitido retirar colaboradores de uma competência futura; o mês selecionado já começou';
      end if;
    end if;
    if cardinality(v_removed_names) <> cardinality(p_removed_names)
        or not (v_removed_names @> p_removed_names and p_removed_names @> v_removed_names) then
      raise exception 'As saídas não correspondem à equipe sincronizada; atualize a aba e tente novamente';
    end if;
    v_inactive_names := array(
      select distinct name from unnest(v_sheet.removed_roster_names || v_removed_names) n(name)
      where not (v_logins ? name) order by name
    );
    select jsonb_agg(p order by ord) into v_added
      from jsonb_array_elements(p_payload->'people') with ordinality incoming(p,ord)
      where not exists (
        select 1 from jsonb_array_elements(v_sheet.current_payload->'people') old_person
        where old_person->>'name'=p->>'name'
      );
  elsif cardinality(p_removed_names) > 0 or jsonb_array_length(p_payload->'people') <>
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
          entry_count=jsonb_array_length(p_payload->'people')*jsonb_array_length(p_payload->'dates'),
          imported_by=p_actor_id,imported_at=now()
        where id=v_official.id;
    end if;
  end if;
  update public.schedule_operational_sheets
    set current_payload=p_payload,removed_roster_names=v_inactive_names,synced_by=p_actor_id,
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
  if v_added is not null then
    insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
    values (v_sheet.draft_id,p_actor_id,'edited',jsonb_build_object(
      'kind','employees_added_from_sheets','sheet_id',v_sheet.id,
      'employees',v_added,'employee_count',jsonb_array_length(v_added)));
  end if;
  if v_removed is not null then
    insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
    values (v_sheet.draft_id,p_actor_id,'edited',jsonb_build_object(
      'kind','employees_removed_from_future_sheet','sheet_id',v_sheet.id,
      'month',v_sheet.schedule_month,'employees',v_removed,
      'employee_count',jsonb_array_length(v_removed)));
  end if;
end $$;

create or replace function public.schedule_operational_apply_sync(
  p_sheet_id uuid, p_expected_updated_at timestamptz, p_actor_id uuid, p_payload jsonb, p_changes jsonb
) returns void language sql security invoker set search_path = '' as $$
  select public.schedule_operational_apply_roster_sync(
    p_sheet_id,p_expected_updated_at,p_actor_id,p_payload,p_changes,array[]::text[]);
$$;

revoke all on function public.schedule_operational_apply_sync(uuid,timestamptz,uuid,jsonb,jsonb),
  public.schedule_operational_apply_roster_sync(uuid,timestamptz,uuid,jsonb,jsonb,text[])
 from public,anon,authenticated;
grant execute on function public.schedule_operational_apply_sync(uuid,timestamptz,uuid,jsonb,jsonb),
  public.schedule_operational_apply_roster_sync(uuid,timestamptz,uuid,jsonb,jsonb,text[])
 to service_role;

notify pgrst,'reload schema';
commit;
