-- Gestor como setor próprio e tarefas avulsas atribuídas a usuários.
insert into public.sectors (slug, name, code, subtitle, color, sort_order)
values ('gestor', 'Gestor', 'GST', 'Gestão geral e acompanhamento', '#b42318', 7)
on conflict (slug) do update
set name = excluded.name,
    code = excluded.code,
    subtitle = excluded.subtitle,
    color = excluded.color,
    sort_order = excluded.sort_order;

alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

create unique index if not exists idx_profiles_email_lower
  on public.profiles (lower(email))
  where email is not null;

create table public.assigned_tasks (
  id uuid primary key default gen_random_uuid(),
  assigned_to uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete cascade,
  sector_id uuid not null references public.sectors(id),
  title text not null check (char_length(trim(title)) between 3 and 300),
  group_name text not null default 'Tarefa avulsa',
  scheduled_date date not null,
  due_time time not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_assigned_tasks_to_date on public.assigned_tasks(assigned_to, scheduled_date);
create index idx_assigned_tasks_by_date on public.assigned_tasks(assigned_by, scheduled_date);
create index idx_assigned_tasks_sector on public.assigned_tasks(sector_id);

grant select, insert, update, delete on public.assigned_tasks to authenticated;
grant all on public.assigned_tasks to service_role;
alter table public.assigned_tasks enable row level security;

create trigger trg_assigned_tasks_updated
before update on public.assigned_tasks
for each row execute function public.set_updated_at();

create policy "assigned_tasks_select_own" on public.assigned_tasks
for select to authenticated
using (
  public.is_active_user((select auth.uid()))
  and assigned_to = (select auth.uid())
);

create policy "assigned_tasks_insert_own" on public.assigned_tasks
for insert to authenticated
with check (
  public.is_active_user((select auth.uid()))
  and assigned_to = (select auth.uid())
  and assigned_by = (select auth.uid())
  and sector_id = public.user_sector((select auth.uid()))
);

create policy "assigned_tasks_update_own" on public.assigned_tasks
for update to authenticated
using (
  public.is_active_user((select auth.uid()))
  and assigned_to = (select auth.uid())
  and assigned_by = (select auth.uid())
)
with check (
  assigned_to = (select auth.uid())
  and assigned_by = (select auth.uid())
  and sector_id = public.user_sector((select auth.uid()))
);

create policy "assigned_tasks_delete_own" on public.assigned_tasks
for delete to authenticated
using (
  public.is_active_user((select auth.uid()))
  and assigned_to = (select auth.uid())
  and assigned_by = (select auth.uid())
);

create policy "assigned_tasks_admin_all" on public.assigned_tasks
for all to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

alter table public.daily_task_records
  add column if not exists assigned_task_id uuid references public.assigned_tasks(id) on delete set null;

alter table public.daily_checklists add column if not exists supervisor_name text not null default '';
alter table public.daily_task_records add column if not exists supervisor_name text not null default '';

update public.daily_checklists c
set supervisor_name = p.full_name
from public.profiles p
where p.id = c.user_id and c.supervisor_name = '';

update public.daily_task_records r
set supervisor_name = p.full_name
from public.profiles p
where p.id = r.user_id and r.supervisor_name = '';

alter table public.daily_checklists drop constraint if exists daily_checklists_user_id_fkey;
alter table public.daily_checklists alter column user_id drop not null;
alter table public.daily_checklists
  add constraint daily_checklists_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

alter table public.daily_task_records drop constraint if exists daily_task_records_user_id_fkey;
alter table public.daily_task_records alter column user_id drop not null;
alter table public.daily_task_records
  add constraint daily_task_records_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

alter table public.assigned_tasks drop constraint if exists assigned_tasks_assigned_by_fkey;
alter table public.assigned_tasks alter column assigned_by drop not null;
alter table public.assigned_tasks
  add constraint assigned_tasks_assigned_by_fkey foreign key (assigned_by) references auth.users(id) on delete set null;

create unique index if not exists idx_records_checklist_assigned_task
  on public.daily_task_records(checklist_id, assigned_task_id)
  where assigned_task_id is not null;

create index if not exists idx_records_assigned_task
  on public.daily_task_records(assigned_task_id)
  where assigned_task_id is not null;

-- Perfil sempre nasce como supervisor pendente. Os metadados são apenas dados de cadastro,
-- nunca uma fonte de autorização.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sector uuid;
begin
  select id into v_sector
  from public.sectors
  where slug = nullif(new.raw_user_meta_data ->> 'sector_slug', '')
    and slug <> 'gestor'
    and is_active = true;

  insert into public.profiles (id, email, full_name, sector_id, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_sector,
    'supervisor',
    'pending'
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null and session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if public.is_admin((select auth.uid())) then return new; end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.sector_id is distinct from old.sector_id
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.email is distinct from old.email then
    raise exception 'Alteração de papel, setor, e-mail ou situação não permitida';
  end if;
  return new;
end;
$$;

-- Mantém contadores e o status do checklist consistentes no banco.
create or replace function public.sync_daily_checklist_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checklist_id uuid;
  v_total integer;
  v_done integer;
begin
  v_checklist_id := case when tg_op = 'DELETE' then old.checklist_id else new.checklist_id end;
  select count(*), count(*) filter (where status = 'completed')
  into v_total, v_done
  from public.daily_task_records
  where checklist_id = v_checklist_id;

  update public.daily_checklists
  set total_tasks = v_total,
      completed_tasks = v_done,
      status = case
        when v_total = 0 then 'not_started'
        when v_done = v_total then 'completed'
        when v_done > 0 then 'in_progress'
        else 'not_started'
      end
  where id = v_checklist_id;

  return null;
end;
$$;

create or replace function public.fill_supervisor_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.supervisor_name, '') = '' and new.user_id is not null then
    select full_name into new.supervisor_name from public.profiles where id = new.user_id;
  end if;
  new.supervisor_name := coalesce(nullif(new.supervisor_name, ''), 'Usuário removido');
  return new;
end;
$$;

create trigger trg_checklist_supervisor_snapshot
before insert on public.daily_checklists
for each row execute function public.fill_supervisor_snapshot();

create trigger trg_record_supervisor_snapshot
before insert on public.daily_task_records
for each row execute function public.fill_supervisor_snapshot();

create trigger trg_sync_daily_checklist_counters
after insert or update or delete on public.daily_task_records
for each row execute function public.sync_daily_checklist_counters();

-- Histórico imutável gerado pelo banco para conclusão, reabertura e observações.
create or replace function public.audit_daily_task_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if old.status is distinct from new.status then
    v_action := case when new.status = 'completed' then 'complete_task' else 'reopen_task' end;
  elsif old.note is distinct from new.note then
    v_action := 'note_task';
  else
    return new;
  end if;

  insert into public.audit_logs(user_id, action, entity, entity_id, old_data, new_data)
  values ((select auth.uid()), v_action, 'daily_task_records', new.id, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

create trigger trg_audit_daily_task_record_change
after update of status, note on public.daily_task_records
for each row execute function public.audit_daily_task_record_change();

revoke execute on function public.sync_daily_checklist_counters() from public, anon, authenticated;
revoke execute on function public.audit_daily_task_record_change() from public, anon, authenticated;
revoke execute on function public.fill_supervisor_snapshot() from public, anon, authenticated;

revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.is_active_user(uuid) from public, anon;
revoke all on function public.user_sector(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.user_sector(uuid) to authenticated;

alter table public.assigned_tasks replica identity full;
alter publication supabase_realtime add table public.assigned_tasks;

-- Políticas finais consolidadas: uma por ação, com funções avaliadas uma vez por consulta.
drop policy if exists "sectors_select_active_users" on public.sectors;
drop policy if exists "sectors_admin_all" on public.sectors;
create policy "sectors_select_authorized" on public.sectors
for select to authenticated
using ((select public.is_active_user((select auth.uid()))));
create policy "sectors_admin_insert" on public.sectors
for insert to authenticated
with check ((select public.is_admin((select auth.uid()))));
create policy "sectors_admin_update" on public.sectors
for update to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));
create policy "sectors_admin_delete" on public.sectors
for delete to authenticated
using ((select public.is_admin((select auth.uid()))));
grant insert, update, delete on public.sectors to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_select_authorized" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin((select auth.uid()))));
create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));
create policy "profiles_update_authorized" on public.profiles
for update to authenticated
using (id = (select auth.uid()) or (select public.is_admin((select auth.uid()))))
with check (id = (select auth.uid()) or (select public.is_admin((select auth.uid()))));

drop policy if exists "templates_select_sector" on public.task_templates;
drop policy if exists "templates_admin_all" on public.task_templates;
create policy "templates_select_authorized" on public.task_templates
for select to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    (select public.is_active_user((select auth.uid())))
    and sector_id = (select public.user_sector((select auth.uid())))
  )
);
create policy "templates_admin_insert" on public.task_templates
for insert to authenticated
with check ((select public.is_admin((select auth.uid()))));
create policy "templates_admin_update" on public.task_templates
for update to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));
create policy "templates_admin_delete" on public.task_templates
for delete to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists "checklists_select_own" on public.daily_checklists;
drop policy if exists "checklists_insert_own" on public.daily_checklists;
drop policy if exists "checklists_update_own" on public.daily_checklists;
drop policy if exists "checklists_admin_all" on public.daily_checklists;
create policy "checklists_select_authorized" on public.daily_checklists
for select to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (user_id = (select auth.uid()) and (select public.is_active_user((select auth.uid()))))
);
create policy "checklists_insert_authorized" on public.daily_checklists
for insert to authenticated
with check (
  (select public.is_admin((select auth.uid())))
  or (
    user_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
    and sector_id = (select public.user_sector((select auth.uid())))
  )
);
create policy "checklists_update_authorized" on public.daily_checklists
for update to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (user_id = (select auth.uid()) and (select public.is_active_user((select auth.uid()))))
)
with check (
  (select public.is_admin((select auth.uid())))
  or (
    user_id = (select auth.uid())
    and sector_id = (select public.user_sector((select auth.uid())))
  )
);

drop policy if exists "records_select_own" on public.daily_task_records;
drop policy if exists "records_insert_own" on public.daily_task_records;
drop policy if exists "records_update_own" on public.daily_task_records;
drop policy if exists "records_admin_all" on public.daily_task_records;
create policy "records_select_authorized" on public.daily_task_records
for select to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (user_id = (select auth.uid()) and (select public.is_active_user((select auth.uid()))))
);
create policy "records_insert_authorized" on public.daily_task_records
for insert to authenticated
with check (
  (select public.is_admin((select auth.uid())))
  or (
    user_id = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
    and sector_id = (select public.user_sector((select auth.uid())))
  )
);
create policy "records_update_authorized" on public.daily_task_records
for update to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (user_id = (select auth.uid()) and (select public.is_active_user((select auth.uid()))))
)
with check (
  (select public.is_admin((select auth.uid())))
  or (
    user_id = (select auth.uid())
    and sector_id = (select public.user_sector((select auth.uid())))
  )
);

drop policy if exists "audit_select_own" on public.audit_logs;
drop policy if exists "audit_select_admin" on public.audit_logs;
drop policy if exists "audit_insert_own" on public.audit_logs;
create policy "audit_select_authorized" on public.audit_logs
for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin((select auth.uid()))));
create policy "audit_insert_own" on public.audit_logs
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "assigned_tasks_select_own" on public.assigned_tasks;
drop policy if exists "assigned_tasks_insert_own" on public.assigned_tasks;
drop policy if exists "assigned_tasks_update_own" on public.assigned_tasks;
drop policy if exists "assigned_tasks_delete_own" on public.assigned_tasks;
drop policy if exists "assigned_tasks_admin_all" on public.assigned_tasks;
create policy "assigned_tasks_select_authorized" on public.assigned_tasks
for select to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    assigned_to = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
);
create policy "assigned_tasks_insert_authorized" on public.assigned_tasks
for insert to authenticated
with check (
  (select public.is_admin((select auth.uid())))
  or (
    assigned_to = (select auth.uid())
    and assigned_by = (select auth.uid())
    and sector_id = (select public.user_sector((select auth.uid())))
    and (select public.is_active_user((select auth.uid())))
  )
);
create policy "assigned_tasks_update_authorized" on public.assigned_tasks
for update to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    assigned_to = (select auth.uid())
    and assigned_by = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
)
with check (
  (select public.is_admin((select auth.uid())))
  or (
    assigned_to = (select auth.uid())
    and assigned_by = (select auth.uid())
    and sector_id = (select public.user_sector((select auth.uid())))
  )
);
create policy "assigned_tasks_delete_authorized" on public.assigned_tasks
for delete to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    assigned_to = (select auth.uid())
    and assigned_by = (select auth.uid())
    and (select public.is_active_user((select auth.uid())))
  )
);

-- Bootstrap seguro do primeiro gestor. Execute pelo SQL Editor após criar o usuário no Auth.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.bootstrap_admin_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  v_user_id uuid;
  v_gestor_sector uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'Crie primeiro o usuário % em Authentication > Users', p_email;
  end if;

  select id into v_gestor_sector from public.sectors where slug = 'gestor';

  update public.profiles
  set role = 'admin',
      status = 'active',
      sector_id = v_gestor_sector,
      approved_at = now(),
      approved_by = v_user_id,
      email = p_email
  where id = v_user_id;

  if not found then
    raise exception 'Perfil não encontrado para %', p_email;
  end if;

  return v_user_id;
end;
$$;

revoke all on function private.bootstrap_admin_by_email(text) from public, anon, authenticated;
