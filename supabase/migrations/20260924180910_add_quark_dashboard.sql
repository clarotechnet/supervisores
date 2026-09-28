-- Painel Quark: espelho de ponto sincronizado sob demanda e cadastros
-- administrativos equivalentes às abas "dados" e "moradia" da planilha.
-- Credenciais e documentos pessoais (CPF/PIS) não são persistidos.

create table public.quark_sync_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null,
  period_start date not null,
  period_end date not null,
  status text not null default 'running'
    check (status in ('running', 'success', 'error')),
  units_processed integer not null default 0 check (units_processed >= 0),
  people_processed integer not null default 0 check (people_processed >= 0),
  days_processed integer not null default 0 check (days_processed >= 0),
  punches_processed integer not null default 0 check (punches_processed >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quark_sync_runs_period_check check (
    period_end >= period_start and period_end - period_start <= 59
  )
);

create index quark_sync_runs_started_at_idx
  on public.quark_sync_runs (started_at desc);

create table public.quark_people (
  unit_id bigint not null,
  collaborator_id text not null check (char_length(trim(collaborator_id)) between 1 and 100),
  unit_name text not null check (char_length(trim(unit_name)) between 1 and 180),
  unit_city text not null check (char_length(trim(unit_city)) between 1 and 100),
  full_name text not null check (char_length(trim(full_name)) between 1 and 180),
  registration text,
  job_title text,
  job_link_title text,
  api_sector text,
  admission_date date,
  is_active boolean not null default true,
  is_esocial boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (unit_id, collaborator_id)
);

create index quark_people_name_idx on public.quark_people (full_name);
create index quark_people_unit_city_idx on public.quark_people (unit_city);
create index quark_people_api_sector_idx on public.quark_people (api_sector);

create table public.quark_people_directory (
  unit_id bigint not null,
  collaborator_id text not null,
  city text not null check (char_length(trim(city)) between 1 and 100),
  sector text not null check (char_length(trim(sector)) between 1 and 120),
  supervisor text not null check (char_length(trim(supervisor)) between 1 and 180),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (unit_id, collaborator_id),
  foreign key (unit_id, collaborator_id)
    references public.quark_people(unit_id, collaborator_id)
    on update cascade on delete cascade
);

create index quark_people_directory_city_idx on public.quark_people_directory (city);
create index quark_people_directory_sector_idx on public.quark_people_directory (sector);
create index quark_people_directory_supervisor_idx on public.quark_people_directory (supervisor);

create table public.quark_home_locations (
  unit_id bigint not null,
  collaborator_id text not null,
  address text not null check (char_length(trim(address)) between 1 and 500),
  latitude numeric(10, 7) not null check (latitude between -90 and 90),
  longitude numeric(10, 7) not null check (longitude between -180 and 180),
  city text not null check (char_length(trim(city)) between 1 and 100),
  state text not null default '' check (char_length(state) <= 50),
  postal_code text not null default '' check (char_length(postal_code) <= 20),
  neighborhood text not null default '' check (char_length(neighborhood) <= 150),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (unit_id, collaborator_id),
  foreign key (unit_id, collaborator_id)
    references public.quark_people(unit_id, collaborator_id)
    on update cascade on delete cascade
);

create index quark_home_locations_city_idx on public.quark_home_locations (city);

create table public.quark_daily_records (
  unit_id bigint not null,
  collaborator_id text not null,
  work_date date not null,
  weekday text,
  journey text,
  is_day_off boolean not null default false,
  scheduled_minutes integer not null default 0,
  worked_minutes integer not null default 0,
  normal_extra_minutes integer not null default 0,
  night_extra_minutes integer not null default 0,
  extra_100_minutes integer not null default 0,
  absence_minutes integer not null default 0,
  excused_absence_minutes integer not null default 0,
  unexcused_absence_minutes integer not null default 0,
  late_minutes integer not null default 0,
  bank_balance_minutes integer not null default 0,
  bank_operation text,
  observation text,
  bank_status text,
  bank_processed_until date,
  updated_at timestamptz not null default now(),
  primary key (unit_id, collaborator_id, work_date),
  foreign key (unit_id, collaborator_id)
    references public.quark_people(unit_id, collaborator_id)
    on update cascade on delete cascade
);

create index quark_daily_records_date_idx
  on public.quark_daily_records (work_date desc);
create index quark_daily_records_person_date_idx
  on public.quark_daily_records (unit_id, collaborator_id, work_date desc);
create index quark_daily_records_alerts_idx
  on public.quark_daily_records (work_date desc)
  where absence_minutes > 0 or late_minutes > 0 or normal_extra_minutes + night_extra_minutes + extra_100_minutes > 120;

create table public.quark_punches (
  point_id text primary key check (char_length(trim(point_id)) between 1 and 120),
  unit_id bigint not null,
  collaborator_id text not null,
  work_date date not null,
  punched_at timestamptz,
  punch_time time,
  location text,
  latitude numeric(10, 7) check (latitude between -90 and 90),
  longitude numeric(10, 7) check (longitude between -180 and 180),
  observation text,
  record_type text,
  is_offline boolean not null default false,
  is_out_of_tolerance boolean not null default false,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  foreign key (unit_id, collaborator_id)
    references public.quark_people(unit_id, collaborator_id)
    on update cascade on delete cascade
);

create index quark_punches_date_idx on public.quark_punches (work_date desc);
create index quark_punches_person_date_idx
  on public.quark_punches (unit_id, collaborator_id, work_date desc);
create index quark_punches_location_idx
  on public.quark_punches (work_date desc)
  where latitude is not null and longitude is not null;

create trigger trg_quark_people_updated
before update on public.quark_people
for each row execute function public.set_updated_at();

create trigger trg_quark_people_directory_updated
before update on public.quark_people_directory
for each row execute function public.set_updated_at();

create trigger trg_quark_home_locations_updated
before update on public.quark_home_locations
for each row execute function public.set_updated_at();

create trigger trg_quark_daily_records_updated
before update on public.quark_daily_records
for each row execute function public.set_updated_at();

create trigger trg_quark_punches_updated
before update on public.quark_punches
for each row execute function public.set_updated_at();

alter table public.quark_sync_runs enable row level security;
alter table public.quark_people enable row level security;
alter table public.quark_people_directory enable row level security;
alter table public.quark_home_locations enable row level security;
alter table public.quark_daily_records enable row level security;
alter table public.quark_punches enable row level security;

revoke all on table public.quark_sync_runs from anon, authenticated;
revoke all on table public.quark_people from anon, authenticated;
revoke all on table public.quark_people_directory from anon, authenticated;
revoke all on table public.quark_home_locations from anon, authenticated;
revoke all on table public.quark_daily_records from anon, authenticated;
revoke all on table public.quark_punches from anon, authenticated;

grant select on table public.quark_sync_runs to authenticated;
grant select on table public.quark_people to authenticated;
grant select, insert, update, delete on table public.quark_people_directory to authenticated;
grant select, insert, update, delete on table public.quark_home_locations to authenticated;
grant select on table public.quark_daily_records to authenticated;
grant select on table public.quark_punches to authenticated;

grant all on table public.quark_sync_runs to service_role;
grant all on table public.quark_people to service_role;
grant all on table public.quark_people_directory to service_role;
grant all on table public.quark_home_locations to service_role;
grant all on table public.quark_daily_records to service_role;
grant all on table public.quark_punches to service_role;

create policy "quark_sync_runs_select_admin"
on public.quark_sync_runs for select to authenticated
using ((select public.is_admin((select auth.uid()))));

create policy "quark_people_select_admin"
on public.quark_people for select to authenticated
using ((select public.is_admin((select auth.uid()))));

create policy "quark_people_directory_select_admin"
on public.quark_people_directory for select to authenticated
using ((select public.is_admin((select auth.uid()))));

create policy "quark_people_directory_insert_admin"
on public.quark_people_directory for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);

create policy "quark_people_directory_update_admin"
on public.quark_people_directory for update to authenticated
using ((select public.is_admin((select auth.uid()))))
with check (
  updated_by = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);

create policy "quark_people_directory_delete_admin"
on public.quark_people_directory for delete to authenticated
using ((select public.is_admin((select auth.uid()))));

create policy "quark_home_locations_select_admin"
on public.quark_home_locations for select to authenticated
using ((select public.is_admin((select auth.uid()))));

create policy "quark_home_locations_insert_admin"
on public.quark_home_locations for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);

create policy "quark_home_locations_update_admin"
on public.quark_home_locations for update to authenticated
using ((select public.is_admin((select auth.uid()))))
with check (
  updated_by = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);

create policy "quark_home_locations_delete_admin"
on public.quark_home_locations for delete to authenticated
using ((select public.is_admin((select auth.uid()))));

create policy "quark_daily_records_select_admin"
on public.quark_daily_records for select to authenticated
using ((select public.is_admin((select auth.uid()))));

create policy "quark_punches_select_admin"
on public.quark_punches for select to authenticated
using ((select public.is_admin((select auth.uid()))));
