-- O controlador é um usuário operacional isolado: ele pode trabalhar somente
-- com as escalas. Permanecer "pending" ainda é obrigatório até a aprovação.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', ''));
  profile_role public.app_role;
  profile_sector uuid;
begin
  profile_role := case
    when requested_role = 'controller' then 'controller'::public.app_role
    else 'supervisor'::public.app_role
  end;

  if profile_role = 'supervisor'::public.app_role then
    select id into profile_sector
    from public.sectors
    where slug = nullif(new.raw_user_meta_data ->> 'sector_slug', '')
      and is_active = true;
  end if;

  insert into public.profiles (id, email, full_name, sector_id, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    profile_sector,
    profile_role,
    'pending'
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

-- As políticas antigas usam este helper para liberar dados da rotina. Excluir
-- controladores aqui garante o isolamento também pela API, não apenas no menu.
create or replace function public.is_active_user(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and p.status = 'active'
      and p.role in ('supervisor'::public.app_role, 'admin'::public.app_role)
  );
$$;

create or replace function public.can_access_schedules(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and p.status = 'active'
      and p.role in ('controller'::public.app_role, 'admin'::public.app_role)
  );
$$;

revoke all on function public.can_access_schedules(uuid) from public, anon;
grant execute on function public.can_access_schedules(uuid) to authenticated;

create table public.schedule_uploads (
  id uuid primary key default gen_random_uuid(),
  city text not null check (city ~ '^[a-z0-9-]{2,50}$'),
  sector text not null check (sector ~ '^[a-z0-9-]{2,80}$'),
  schedule_month date not null check (
    schedule_month = date_trunc('month', schedule_month)::date
  ),
  source_file text not null check (char_length(trim(source_file)) between 1 and 255),
  source_sheet text not null check (char_length(trim(source_sheet)) between 1 and 255),
  employee_count integer not null default 0 check (employee_count >= 0),
  entry_count integer not null default 0 check (entry_count >= 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'dates') = 'array'
    and jsonb_typeof(payload -> 'people') = 'array'
  ),
  imported_by uuid references public.profiles(id) on delete set null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_uploads_scope_key unique (city, sector, schedule_month)
);

create index schedule_uploads_month_idx
  on public.schedule_uploads (schedule_month desc);
create index schedule_uploads_imported_by_idx
  on public.schedule_uploads (imported_by)
  where imported_by is not null;

create trigger trg_schedule_uploads_updated
before update on public.schedule_uploads
for each row execute function public.set_updated_at();

alter table public.schedule_uploads enable row level security;
revoke all on table public.schedule_uploads from anon, authenticated;
grant select, insert, update, delete on table public.schedule_uploads to authenticated;
grant all on table public.schedule_uploads to service_role;

create policy "schedule_uploads_select_authorized"
on public.schedule_uploads
for select
to authenticated
using ((select public.can_access_schedules((select auth.uid()))));

create policy "schedule_uploads_insert_authorized"
on public.schedule_uploads
for insert
to authenticated
with check (
  imported_by = (select auth.uid())
  and (select public.can_access_schedules((select auth.uid())))
);

create policy "schedule_uploads_update_authorized"
on public.schedule_uploads
for update
to authenticated
using ((select public.can_access_schedules((select auth.uid()))))
with check (
  imported_by = (select auth.uid())
  and (select public.can_access_schedules((select auth.uid())))
);

create policy "schedule_uploads_delete_authorized"
on public.schedule_uploads
for delete
to authenticated
using ((select public.can_access_schedules((select auth.uid()))));
