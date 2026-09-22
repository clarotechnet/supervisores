-- Gestores, supervisores e controladores podem consultar escalas.
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
      and p.role in (
        'supervisor'::public.app_role,
        'controller'::public.app_role,
        'admin'::public.app_role
      )
  );
$$;

revoke all on function public.can_access_schedules(uuid) from public, anon;
grant execute on function public.can_access_schedules(uuid) to authenticated;

-- Somente gestor e supervisor podem importar, substituir ou excluir escalas.
create or replace function public.can_manage_schedules(_uid uuid)
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

revoke all on function public.can_manage_schedules(uuid) from public, anon;
grant execute on function public.can_manage_schedules(uuid) to authenticated;

drop policy if exists "schedule_uploads_insert_authorized" on public.schedule_uploads;
drop policy if exists "schedule_uploads_update_authorized" on public.schedule_uploads;
drop policy if exists "schedule_uploads_delete_authorized" on public.schedule_uploads;

create policy "schedule_uploads_insert_authorized"
on public.schedule_uploads
for insert
to authenticated
with check (
  imported_by = (select auth.uid())
  and (select public.can_manage_schedules((select auth.uid())))
);

create policy "schedule_uploads_update_authorized"
on public.schedule_uploads
for update
to authenticated
using ((select public.can_manage_schedules((select auth.uid()))))
with check (
  imported_by = (select auth.uid())
  and (select public.can_manage_schedules((select auth.uid())))
);

create policy "schedule_uploads_delete_authorized"
on public.schedule_uploads
for delete
to authenticated
using ((select public.can_manage_schedules((select auth.uid()))));

-- As observações continuam direcionadas aos controladores e gestores.
-- Supervisores podem consultar/importar escalas, mas não recebem esses recados.
drop policy if exists "schedule_date_notes_select_authorized" on public.schedule_date_notes;

create policy "schedule_date_notes_select_authorized"
on public.schedule_date_notes
for select
to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (select public.is_controller((select auth.uid())))
);
