-- Fase operacional: espelho editável isolado da origem Google Sheets.
-- Aplicação manual no projeto Supabase correto; NÃO aplicar sem validação de destino.
create table if not exists public.schedule_operational_sheets (
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null unique references public.schedule_generation_drafts(id) on delete restrict,
 city text not null,
 sector text not null,
 schedule_month date not null,
 spreadsheet_id text not null unique,
 spreadsheet_url text not null,
 planned_payload jsonb not null check (jsonb_typeof(planned_payload)='object'),
 current_payload jsonb not null check (jsonb_typeof(current_payload)='object'),
 created_by uuid not null references public.profiles(id),
 synced_by uuid references public.profiles(id),
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists schedule_operational_sheets_scope_idx
 on public.schedule_operational_sheets(city,sector,schedule_month desc,created_at desc);
create table if not exists public.schedule_operational_changes (
 id uuid primary key default gen_random_uuid(),
 sheet_id uuid not null references public.schedule_operational_sheets(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 employee_key text not null,
 employee_name text not null,
 duty_date date not null,
 planned_code text not null default '',
 previous_code text not null default '',
 current_code text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists schedule_operational_changes_idx
 on public.schedule_operational_changes(sheet_id,created_at desc);
alter table public.schedule_operational_sheets enable row level security;
alter table public.schedule_operational_changes enable row level security;
revoke all on public.schedule_operational_sheets,public.schedule_operational_changes
 from anon,authenticated;
grant select on public.schedule_operational_sheets,public.schedule_operational_changes
 to authenticated;
grant all on public.schedule_operational_sheets,public.schedule_operational_changes
 to service_role;
create policy schedule_operational_read on public.schedule_operational_sheets
 for select to authenticated
 using ((select public.can_access_schedules((select auth.uid()))));
create policy schedule_operational_changes_read on public.schedule_operational_changes
 for select to authenticated
 using ((select public.can_access_schedules((select auth.uid()))));
-- Browser can't write directly. The Edge Function authenticates user, checks role
-- and uses service_role for atomic operational updates.

-- Aplica a nova versão e a trilha de auditoria em uma transação.
-- SECURITY INVOKER e execução exclusiva do service_role (após autenticação na Edge).
create or replace function public.schedule_operational_apply_sync(
  p_sheet_id uuid,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_payload jsonb,
  p_changes jsonb
)
returns void language plpgsql security invoker set search_path=public as $$
declare v_count integer;
begin
  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Dados operacionais inválidos';
  end if;
  update public.schedule_operational_sheets
  set current_payload=p_payload,synced_by=p_actor_id,
      last_synced_at=now(),updated_at=now()
  where id=p_sheet_id and updated_at=p_expected_updated_at;
  get diagnostics v_count=row_count;
  if v_count<>1 then
    raise exception 'Conflito: outra pessoa sincronizou antes; recarregue';
  end if;
  insert into public.schedule_operational_changes(
    sheet_id,actor_id,employee_key,employee_name,duty_date,
    planned_code,previous_code,current_code
  )
  select p_sheet_id,p_actor_id,
    item->>'employee_key',
    item->>'employee_name',
    (item->>'duty_date')::date,
    coalesce(item->>'planned_code',''),
    coalesce(item->>'previous_code',''),
    coalesce(item->>'current_code','')
  from jsonb_array_elements(p_changes) item;
end $$;
revoke all on function public.schedule_operational_apply_sync(
  uuid,timestamptz,uuid,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.schedule_operational_apply_sync(
  uuid,timestamptz,uuid,jsonb,jsonb
) to service_role;

