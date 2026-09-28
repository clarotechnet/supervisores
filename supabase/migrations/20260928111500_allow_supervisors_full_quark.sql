-- Supervisores atuais de controle terão acesso completo ao modulo Quark.
create or replace function public.can_manage_quark(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = _uid
      and status = 'active'
      and role in ('admin', 'supervisor')
  );
$$;

revoke execute on function public.can_manage_quark(uuid) from public, anon;
grant execute on function public.can_manage_quark(uuid) to authenticated, service_role;

drop policy if exists "quark_sync_runs_select_admin" on public.quark_sync_runs;
drop policy if exists "quark_people_select_admin" on public.quark_people;
drop policy if exists "quark_people_directory_select_admin" on public.quark_people_directory;
drop policy if exists "quark_people_directory_insert_admin" on public.quark_people_directory;
drop policy if exists "quark_people_directory_update_admin" on public.quark_people_directory;
drop policy if exists "quark_people_directory_delete_admin" on public.quark_people_directory;
drop policy if exists "quark_home_locations_select_admin" on public.quark_home_locations;
drop policy if exists "quark_home_locations_insert_admin" on public.quark_home_locations;
drop policy if exists "quark_home_locations_update_admin" on public.quark_home_locations;
drop policy if exists "quark_home_locations_delete_admin" on public.quark_home_locations;
drop policy if exists "quark_daily_records_select_admin" on public.quark_daily_records;
drop policy if exists "quark_punches_select_admin" on public.quark_punches;

-- Mantém a migration segura caso ela precise ser reaplicada em outro ambiente
-- ou seja executada depois de uma aplicação manual pelo SQL Editor.
drop policy if exists "quark_sync_runs_select_manager" on public.quark_sync_runs;
drop policy if exists "quark_people_select_manager" on public.quark_people;
drop policy if exists "quark_people_directory_select_manager" on public.quark_people_directory;
drop policy if exists "quark_people_directory_insert_manager" on public.quark_people_directory;
drop policy if exists "quark_people_directory_update_manager" on public.quark_people_directory;
drop policy if exists "quark_people_directory_delete_manager" on public.quark_people_directory;
drop policy if exists "quark_home_locations_select_manager" on public.quark_home_locations;
drop policy if exists "quark_home_locations_insert_manager" on public.quark_home_locations;
drop policy if exists "quark_home_locations_update_manager" on public.quark_home_locations;
drop policy if exists "quark_home_locations_delete_manager" on public.quark_home_locations;
drop policy if exists "quark_daily_records_select_manager" on public.quark_daily_records;
drop policy if exists "quark_punches_select_manager" on public.quark_punches;

create policy "quark_sync_runs_select_manager"
on public.quark_sync_runs for select to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

create policy "quark_people_select_manager"
on public.quark_people for select to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

create policy "quark_people_directory_select_manager"
on public.quark_people_directory for select to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

create policy "quark_people_directory_insert_manager"
on public.quark_people_directory for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and (select public.can_manage_quark((select auth.uid())))
);

create policy "quark_people_directory_update_manager"
on public.quark_people_directory for update to authenticated
using ((select public.can_manage_quark((select auth.uid()))))
with check (
  updated_by = (select auth.uid())
  and (select public.can_manage_quark((select auth.uid())))
);

create policy "quark_people_directory_delete_manager"
on public.quark_people_directory for delete to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

create policy "quark_home_locations_select_manager"
on public.quark_home_locations for select to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

create policy "quark_home_locations_insert_manager"
on public.quark_home_locations for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and (select public.can_manage_quark((select auth.uid())))
);

create policy "quark_home_locations_update_manager"
on public.quark_home_locations for update to authenticated
using ((select public.can_manage_quark((select auth.uid()))))
with check (
  updated_by = (select auth.uid())
  and (select public.can_manage_quark((select auth.uid())))
);

create policy "quark_home_locations_delete_manager"
on public.quark_home_locations for delete to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

create policy "quark_daily_records_select_manager"
on public.quark_daily_records for select to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

create policy "quark_punches_select_manager"
on public.quark_punches for select to authenticated
using ((select public.can_manage_quark((select auth.uid()))));

select pg_notify('pgrst', 'reload schema');
