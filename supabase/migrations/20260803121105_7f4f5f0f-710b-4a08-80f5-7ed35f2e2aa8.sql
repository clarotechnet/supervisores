
-- ============ ENUMS ============
create type public.app_role as enum ('supervisor','admin');
create type public.user_status as enum ('pending','active','rejected','inactive');
create type public.task_status as enum ('pending','completed','reopened');

-- ============ UTIL ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ SECTORS ============
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  code text not null,
  subtitle text not null default '',
  color text not null default '#d92d38',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.sectors to authenticated;
grant all on public.sectors to service_role;
alter table public.sectors enable row level security;

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  sector_id uuid references public.sectors(id),
  role public.app_role not null default 'supervisor',
  status public.user_status not null default 'pending',
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_sector on public.profiles(sector_id);
create index idx_profiles_role_status on public.profiles(role, status);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============ SECURITY DEFINER HELPERS ============
create or replace function public.is_admin(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = _uid and p.role = 'admin' and p.status = 'active');
$$;

create or replace function public.is_active_user(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = _uid and p.status = 'active');
$$;

create or replace function public.user_sector(_uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.sector_id from public.profiles p where p.id = _uid;
$$;

-- ============ TASK TEMPLATES ============
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  title text not null,
  group_name text not null default '',
  due_time time not null,
  weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_task_templates_sector on public.task_templates(sector_id);
create index idx_task_templates_active on public.task_templates(is_active);
grant select, insert, update, delete on public.task_templates to authenticated;
grant all on public.task_templates to service_role;
alter table public.task_templates enable row level security;
create trigger trg_templates_updated before update on public.task_templates
  for each row execute function public.set_updated_at();

-- ============ DAILY CHECKLISTS ============
create table public.daily_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sector_id uuid not null references public.sectors(id),
  checklist_date date not null,
  total_tasks int not null default 0,
  completed_tasks int not null default 0,
  status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checklist_date)
);
create index idx_checklists_user on public.daily_checklists(user_id);
create index idx_checklists_sector on public.daily_checklists(sector_id);
create index idx_checklists_date on public.daily_checklists(checklist_date);
grant select, insert, update on public.daily_checklists to authenticated;
grant all on public.daily_checklists to service_role;
alter table public.daily_checklists enable row level security;
create trigger trg_checklists_updated before update on public.daily_checklists
  for each row execute function public.set_updated_at();

-- ============ DAILY TASK RECORDS ============
create table public.daily_task_records (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.daily_checklists(id) on delete cascade,
  task_template_id uuid references public.task_templates(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sector_id uuid not null references public.sectors(id),
  title text not null default '',
  group_name text not null default '',
  scheduled_date date not null,
  scheduled_time time not null,
  status public.task_status not null default 'pending',
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checklist_id, task_template_id)
);
create index idx_records_user on public.daily_task_records(user_id);
create index idx_records_sector on public.daily_task_records(sector_id);
create index idx_records_date on public.daily_task_records(scheduled_date);
create index idx_records_checklist on public.daily_task_records(checklist_id);
create index idx_records_status on public.daily_task_records(status);
grant select, insert, update on public.daily_task_records to authenticated;
grant all on public.daily_task_records to service_role;
alter table public.daily_task_records enable row level security;
create trigger trg_records_updated before update on public.daily_task_records
  for each row execute function public.set_updated_at();

-- ============ AUDIT LOGS ============
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_user on public.audit_logs(user_id);
create index idx_audit_entity on public.audit_logs(entity, entity_id);
create index idx_audit_created on public.audit_logs(created_at);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;

-- ============ POLICIES ============
-- sectors
create policy "sectors_select_active_users" on public.sectors for select to authenticated
  using (public.is_active_user(auth.uid()));
create policy "sectors_admin_all" on public.sectors for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- profiles
create policy "profiles_select_own" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles_select_admin" on public.profiles for select to authenticated
  using (public.is_admin(auth.uid()));
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- block privilege escalation by the user itself
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin(auth.uid()) then return new; end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.sector_id is distinct from old.sector_id
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by then
    raise exception 'Alteracao de papel, setor ou situacao nao permitida';
  end if;
  return new;
end; $$;
create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- task templates
create policy "templates_select_sector" on public.task_templates for select to authenticated
  using (public.is_active_user(auth.uid()) and sector_id = public.user_sector(auth.uid()));
create policy "templates_admin_all" on public.task_templates for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- checklists
create policy "checklists_select_own" on public.daily_checklists for select to authenticated
  using (user_id = auth.uid() and public.is_active_user(auth.uid()));
create policy "checklists_insert_own" on public.daily_checklists for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user(auth.uid()) and sector_id = public.user_sector(auth.uid()));
create policy "checklists_update_own" on public.daily_checklists for update to authenticated
  using (user_id = auth.uid() and public.is_active_user(auth.uid()))
  with check (user_id = auth.uid() and sector_id = public.user_sector(auth.uid()));
create policy "checklists_admin_all" on public.daily_checklists for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- records
create policy "records_select_own" on public.daily_task_records for select to authenticated
  using (user_id = auth.uid() and public.is_active_user(auth.uid()));
create policy "records_insert_own" on public.daily_task_records for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user(auth.uid()) and sector_id = public.user_sector(auth.uid()));
create policy "records_update_own" on public.daily_task_records for update to authenticated
  using (user_id = auth.uid() and public.is_active_user(auth.uid()))
  with check (user_id = auth.uid() and sector_id = public.user_sector(auth.uid()));
create policy "records_admin_all" on public.daily_task_records for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- audit
create policy "audit_insert_own" on public.audit_logs for insert to authenticated
  with check (user_id = auth.uid());
create policy "audit_select_own" on public.audit_logs for select to authenticated
  using (user_id = auth.uid());
create policy "audit_select_admin" on public.audit_logs for select to authenticated
  using (public.is_admin(auth.uid()));

-- ============ NEW USER TRIGGER ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sector uuid;
begin
  select id into v_sector from public.sectors
   where slug = nullif(new.raw_user_meta_data ->> 'sector_slug','');
  insert into public.profiles (id, full_name, sector_id, role, status)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name',''), v_sector, 'supervisor', 'pending')
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ REALTIME ============
alter table public.daily_checklists replica identity full;
alter table public.daily_task_records replica identity full;
alter table public.profiles replica identity full;
alter publication supabase_realtime add table public.daily_checklists;
alter publication supabase_realtime add table public.daily_task_records;
alter publication supabase_realtime add table public.profiles;

