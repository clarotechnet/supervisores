-- Pedido de CONSULTA apenas para Controle operacional, por usuário e cidade.
-- Nenhum pedido é aprovado automaticamente. Demais frentes mantêm suas regras.
-- Aplicar após a migration de publicação operacional (20261028170000).
begin;
create table public.schedule_control_access (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references public.profiles(id) on delete set null,
 city text not null check(city ~ '^[a-z0-9-]{2,50}$'),
 status text not null default 'pending' check(status in ('pending','approved','denied','revoked')),
 request_note text not null default '' check(char_length(request_note)<=500),
 review_note text not null default '' check(char_length(review_note)<=500),
 requested_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id) on delete set null,
 reviewed_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,city),
 check((status='pending' and reviewed_by is null and reviewed_at is null)
   or (status<>'pending' and reviewed_at is not null))
);
create index schedule_control_access_queue_idx
 on public.schedule_control_access(status,requested_at desc);
create index schedule_control_access_reviewer_idx
 on public.schedule_control_access(reviewed_by) where reviewed_by is not null;
create table public.schedule_control_access_events (
 id uuid primary key default gen_random_uuid(),
 access_id uuid not null references public.schedule_control_access(id),
 actor_id uuid references public.profiles(id) on delete set null,
 action text not null check(action in ('requested','approved','denied','revoked')),
 previous_status text,
 current_status text not null check(current_status in ('pending','approved','denied','revoked')),
 note text not null default '' check(char_length(note)<=500),
 created_at timestamptz not null default clock_timestamp()
);
create index schedule_control_access_events_idx
 on public.schedule_control_access_events(access_id,created_at desc);
create index schedule_control_access_events_actor_idx
 on public.schedule_control_access_events(actor_id);
alter table public.schedule_control_access enable row level security;
alter table public.schedule_control_access_events enable row level security;
revoke all on public.schedule_control_access,public.schedule_control_access_events
 from public,anon,authenticated;
grant select on public.schedule_control_access,public.schedule_control_access_events to authenticated;
grant all on public.schedule_control_access,public.schedule_control_access_events to service_role;
create policy schedule_control_access_read on public.schedule_control_access
 for select to authenticated using (
  (select public.can_access_schedules((select auth.uid())))
  and (user_id=(select auth.uid()) or (select public.is_admin((select auth.uid()))))
 );
create policy schedule_control_access_events_read on public.schedule_control_access_events
 for select to authenticated using (
  exists(select 1 from public.schedule_control_access a where a.id=access_id)
 );

create function public.schedule_can_read_scope(p_user_id uuid,p_city text,p_sector text)
returns boolean language sql stable security invoker set search_path=public as $$
 select public.can_access_schedules(p_user_id) and (
  p_sector is distinct from 'controle-operacional' or public.is_admin(p_user_id)
  or exists(select 1 from public.schedule_control_access a
    where a.user_id=p_user_id and a.city=p_city and a.status='approved')
 );
$$;
create function public.schedule_can_manage_scope(p_user_id uuid,p_city text,p_sector text)
returns boolean language sql stable security invoker set search_path=public as $$
 select public.can_manage_schedules(p_user_id)
   and (p_sector is distinct from 'controle-operacional' or public.is_admin(p_user_id));
$$;
-- Planejamento, versões e links do Sheets ficam restritos à gestão do Controle.
-- A autorização concedida ao usuário permite ler a escala OFICIAL.
create function public.schedule_can_read_planning_scope(p_user_id uuid,p_city text,p_sector text)
returns boolean language sql stable security invoker set search_path=public as $$
 select public.can_access_schedules(p_user_id)
   and (p_sector is distinct from 'controle-operacional' or public.is_admin(p_user_id));
$$;
revoke all on function public.schedule_can_read_scope(uuid,text,text),
 public.schedule_can_manage_scope(uuid,text,text),
 public.schedule_can_read_planning_scope(uuid,text,text) from public,anon;
grant execute on function public.schedule_can_read_scope(uuid,text,text),
 public.schedule_can_manage_scope(uuid,text,text),
 public.schedule_can_read_planning_scope(uuid,text,text) to authenticated,service_role;

-- Dependências chamadas pelas RPCs com SECURITY INVOKER.
grant execute on function public.can_access_schedules(uuid),
 public.can_manage_schedules(uuid),public.is_admin(uuid) to service_role;

-- RESTRICTIVE soma-se às políticas existentes, sem ampliar privilégios.
create policy schedule_control_scope on public.schedule_uploads as restrictive
 for all to authenticated
 using(public.schedule_can_read_scope((select auth.uid()),city,sector))
 with check(public.schedule_can_read_scope((select auth.uid()),city,sector));
create policy schedule_control_insert on public.schedule_uploads as restrictive
 for insert to authenticated
 with check(public.schedule_can_manage_scope((select auth.uid()),city,sector));
create policy schedule_control_update on public.schedule_uploads as restrictive
 for update to authenticated
 using(public.schedule_can_manage_scope((select auth.uid()),city,sector))
 with check(public.schedule_can_manage_scope((select auth.uid()),city,sector));
create policy schedule_control_delete on public.schedule_uploads as restrictive
 for delete to authenticated
 using(public.schedule_can_manage_scope((select auth.uid()),city,sector));

do $$
declare v_table text;
begin
 foreach v_table in array array[
  'schedule_generation_policies','schedule_generation_drafts','schedule_operational_sheets'
 ] loop
  execute format(
   'create policy schedule_control_scope on public.%I as restrictive for all to authenticated
    using(public.schedule_can_read_planning_scope((select auth.uid()),city,sector))
    with check(public.schedule_can_read_planning_scope((select auth.uid()),city,sector))',v_table);
 end loop;
end $$;
create policy schedule_control_scope on public.schedule_generation_events as restrictive
 for all to authenticated
 using(exists(select 1 from public.schedule_generation_drafts d where d.id=draft_id))
 with check(exists(select 1 from public.schedule_generation_drafts d where d.id=draft_id));
create policy schedule_control_scope on public.schedule_operational_changes as restrictive
 for all to authenticated
 using(exists(select 1 from public.schedule_operational_sheets s where s.id=sheet_id))
 with check(exists(select 1 from public.schedule_operational_sheets s where s.id=sheet_id));
create policy schedule_control_scope on public.schedule_date_notes as restrictive
 for all to authenticated
 using(exists(select 1 from public.schedule_uploads u where u.id=schedule_upload_id))
 with check(exists(select 1 from public.schedule_uploads u where u.id=schedule_upload_id));
create policy schedule_control_scope on public.schedule_suggestions as restrictive
 for all to authenticated
 using(
  public.schedule_can_read_scope((select auth.uid()),city,sector)
  and (schedule_upload_id is null or exists(
    select 1 from public.schedule_uploads u where u.id=schedule_upload_id))
 )
 with check(
  public.schedule_can_read_scope((select auth.uid()),city,sector)
  and (schedule_upload_id is null or exists(
    select 1 from public.schedule_uploads u where u.id=schedule_upload_id))
 );

-- Somente a Edge autenticada pode escrever pedidos/decisões.
-- As RPCs também validam o papel e registram auditoria na mesma transação.
create function public.schedule_control_request(p_user_id uuid,p_city text,p_note text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_access public.schedule_control_access%rowtype; v_previous text;
begin
 if public.can_access_schedules(p_user_id) is distinct from true
    or public.is_admin(p_user_id) then
  raise exception using errcode='42501',message='Usuário não pode solicitar acesso';
 end if;
 if p_city is null or p_city !~ '^[a-z0-9-]{2,50}$'
    or p_note is null or char_length(p_note)>500 then
  raise exception 'Pedido inválido';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(
  jsonb_build_array('schedule-control-access',p_user_id,p_city)::text,0));
 select * into v_access from public.schedule_control_access
  where user_id=p_user_id and city=p_city for update;
 if found and v_access.status in ('pending','approved') then return v_access.id; end if;
 v_previous:=v_access.status;
 if v_access.id is null then
  insert into public.schedule_control_access(user_id,city,request_note)
  values(p_user_id,p_city,btrim(p_note)) returning * into v_access;
 else
  update public.schedule_control_access set status='pending',request_note=btrim(p_note),
   review_note='',requested_at=now(),reviewed_by=null,reviewed_at=null,
   updated_at=clock_timestamp() where id=v_access.id returning * into v_access;
 end if;
 insert into public.schedule_control_access_events(
  access_id,actor_id,action,previous_status,current_status,note)
 values(v_access.id,p_user_id,'requested',v_previous,'pending',btrim(p_note));
 return v_access.id;
end $$;

create function public.schedule_control_review(
 p_access_id uuid,p_actor_id uuid,p_decision text,p_expected_updated_at timestamptz,p_note text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_access public.schedule_control_access%rowtype;
begin
 if public.can_access_schedules(p_actor_id) is distinct from true
    or public.is_admin(p_actor_id) is distinct from true then
  raise exception using errcode='42501',message='Apenas administrador ativo pode decidir acessos';
 end if;
 if p_decision is null or p_decision not in ('approved','denied','revoked')
    or p_note is null or char_length(p_note)>500 then
  raise exception 'Decisão inválida';
 end if;
 select * into v_access from public.schedule_control_access where id=p_access_id for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if v_access.updated_at is distinct from p_expected_updated_at then
  raise exception using errcode='40001',message='Conflito: o pedido mudou; atualize a lista';
 end if;
 if (p_decision in ('approved','denied') and v_access.status<>'pending')
    or (p_decision='revoked' and v_access.status<>'approved') then
  raise exception 'Esta decisão não é válida para o estado atual do pedido';
 end if;
 if p_decision='approved' and public.can_access_schedules(v_access.user_id) is distinct from true then
  raise exception 'Não é possível aprovar usuário inativo';
 end if;
 update public.schedule_control_access set status=p_decision,review_note=btrim(p_note),
  reviewed_by=p_actor_id,reviewed_at=now(),updated_at=clock_timestamp()
 where id=p_access_id;
 insert into public.schedule_control_access_events(
  access_id,actor_id,action,previous_status,current_status,note)
 values(p_access_id,p_actor_id,p_decision,v_access.status,p_decision,btrim(p_note));
 return p_access_id;
end $$;
revoke all on function public.schedule_control_request(uuid,text,text),
 public.schedule_control_review(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.schedule_control_request(uuid,text,text),
 public.schedule_control_review(uuid,uuid,text,timestamptz,text) to service_role;
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
  if public.schedule_can_manage_scope(p_actor_id,v_sheet.city,v_sheet.sector) is distinct from true then
    raise exception using errcode='42501',
      message='Apenas administrador pode gerenciar Controle operacional';
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

notify pgrst,'reload schema';
commit;
