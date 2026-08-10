-- Separa os modelos da rotina pessoal de cada gestor.
--
-- Os setores operacionais continuam compartilhando seus modelos entre os
-- supervisores do mesmo setor. O setor Gestor passa a exigir owner_id e cada
-- administrador enxerga somente os seus próprios modelos pessoais.

alter table public.task_templates
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade;

create index if not exists idx_task_templates_owner_sector_active
  on public.task_templates (owner_id, sector_id, is_active)
  where owner_id is not null;

drop policy if exists "templates_select_authorized" on public.task_templates;
drop policy if exists "templates_admin_insert" on public.task_templates;
drop policy if exists "templates_admin_update" on public.task_templates;
drop policy if exists "templates_admin_delete" on public.task_templates;

create policy "templates_select_authorized" on public.task_templates
for select to authenticated
using (
  (
    (select public.is_admin((select auth.uid())))
    and (
      (
        sector_id = (select id from public.sectors where slug = 'gestor')
        and owner_id = (select auth.uid())
      )
      or (
        sector_id <> (select id from public.sectors where slug = 'gestor')
        and owner_id is null
      )
    )
  )
  or (
    (select public.is_active_user((select auth.uid())))
    and not (select public.is_admin((select auth.uid())))
    and sector_id = (select public.user_sector((select auth.uid())))
    and sector_id <> (select id from public.sectors where slug = 'gestor')
    and owner_id is null
  )
);

create policy "templates_admin_insert" on public.task_templates
for insert to authenticated
with check (
  (select public.is_admin((select auth.uid())))
  and (
    (
      sector_id = (select id from public.sectors where slug = 'gestor')
      and owner_id = (select auth.uid())
    )
    or (
      sector_id <> (select id from public.sectors where slug = 'gestor')
      and owner_id is null
    )
  )
);

create policy "templates_admin_update" on public.task_templates
for update to authenticated
using (
  (select public.is_admin((select auth.uid())))
  and (
    (
      sector_id = (select id from public.sectors where slug = 'gestor')
      and owner_id = (select auth.uid())
    )
    or (
      sector_id <> (select id from public.sectors where slug = 'gestor')
      and owner_id is null
    )
  )
)
with check (
  (select public.is_admin((select auth.uid())))
  and (
    (
      sector_id = (select id from public.sectors where slug = 'gestor')
      and owner_id = (select auth.uid())
    )
    or (
      sector_id <> (select id from public.sectors where slug = 'gestor')
      and owner_id is null
    )
  )
);

create policy "templates_admin_delete" on public.task_templates
for delete to authenticated
using (
  (select public.is_admin((select auth.uid())))
  and (
    (
      sector_id = (select id from public.sectors where slug = 'gestor')
      and owner_id = (select auth.uid())
    )
    or (
      sector_id <> (select id from public.sectors where slug = 'gestor')
      and owner_id is null
    )
  )
);

comment on column public.task_templates.owner_id is
  'Proprietário do modelo quando a atividade pertence à rotina pessoal de um gestor; nulo para modelos compartilhados de setores operacionais.';
