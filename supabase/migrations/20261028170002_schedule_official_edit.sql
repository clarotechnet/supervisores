-- Apenas estrutura/permissões. Não publica escalas nem grava no Google.
begin;
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


create table public.schedule_sheet_edits (
 id uuid primary key default gen_random_uuid(),
 schedule_upload_id uuid references public.schedule_uploads(id) on delete set null,
 actor_id uuid references public.profiles(id) on delete set null,
 city text not null, sector text not null, schedule_month date not null,
 spreadsheet_id text not null, sheet_tab text not null, cell_a1 text not null,
 employee_name text not null, duty_date date not null,
 previous_code text not null, current_code text not null,
 status text not null default 'pending' check(status in ('pending','sheet_written','applied','failed','unconfirmed')),
 error_message text, created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.schedule_sheet_edits enable row level security;
revoke all on public.schedule_sheet_edits from anon,authenticated;
grant select on public.schedule_sheet_edits to authenticated;
grant all on public.schedule_sheet_edits to service_role;
create policy schedule_sheet_edits_read on public.schedule_sheet_edits for select to authenticated
 using (public.schedule_can_manage_scope(auth.uid(),city,sector));
create unique index schedule_sheet_edits_pending on public.schedule_sheet_edits(city,sector,schedule_month,employee_name,duty_date) where status='pending';
notify pgrst,'reload schema';
commit;
