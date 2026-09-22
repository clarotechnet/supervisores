-- Identifica controladores ativos sem depender das políticas de profiles.
create or replace function public.is_controller(_uid uuid)
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
      and p.role = 'controller'::public.app_role
  );
$$;

revoke all on function public.is_controller(uuid) from public, anon;
grant execute on function public.is_controller(uuid) to authenticated;

create table public.schedule_suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  schedule_upload_id uuid references public.schedule_uploads(id) on delete set null,
  city text check (city is null or city ~ '^[a-z0-9-]{2,50}$'),
  sector text check (sector is null or sector ~ '^[a-z0-9-]{2,80}$'),
  schedule_month date check (
    schedule_month is null
    or schedule_month = date_trunc('month', schedule_month)::date
  ),
  category text not null check (category in ('improvement', 'addition', 'correction', 'other')),
  title text not null check (char_length(trim(title)) between 3 and 120),
  message text not null check (char_length(trim(message)) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'completed')),
  manager_response text check (
    manager_response is null or char_length(trim(manager_response)) between 1 and 2000
  ),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_suggestions_review_fields_check check (
    (reviewed_at is null and reviewed_by is null)
    or (reviewed_at is not null and reviewed_by is not null)
  )
);

create index schedule_suggestions_author_created_idx
  on public.schedule_suggestions (author_id, created_at desc);
create index schedule_suggestions_status_created_idx
  on public.schedule_suggestions (status, created_at desc);
create index schedule_suggestions_schedule_upload_idx
  on public.schedule_suggestions (schedule_upload_id)
  where schedule_upload_id is not null;
create index schedule_suggestions_reviewed_by_idx
  on public.schedule_suggestions (reviewed_by)
  where reviewed_by is not null;

create trigger trg_schedule_suggestions_updated
before update on public.schedule_suggestions
for each row execute function public.set_updated_at();

alter table public.schedule_suggestions enable row level security;
revoke all on table public.schedule_suggestions from anon, authenticated;
grant select, insert, update, delete on table public.schedule_suggestions to authenticated;
grant all on table public.schedule_suggestions to service_role;

create policy "schedule_suggestions_select_authorized"
on public.schedule_suggestions
for select
to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    author_id = (select auth.uid())
    and (select public.is_controller((select auth.uid())))
  )
);

create policy "schedule_suggestions_insert_controller"
on public.schedule_suggestions
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'open'
  and manager_response is null
  and reviewed_by is null
  and reviewed_at is null
  and (select public.is_controller((select auth.uid())))
);

create policy "schedule_suggestions_update_admin"
on public.schedule_suggestions
for update
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

create policy "schedule_suggestions_delete_admin"
on public.schedule_suggestions
for delete
to authenticated
using ((select public.is_admin((select auth.uid()))));

-- A observação pertence à data da escala, não a um colaborador específico.
-- Assim todos os controladores que consultarem aquela escala recebem o mesmo recado.
create table public.schedule_date_notes (
  id uuid primary key default gen_random_uuid(),
  schedule_upload_id uuid not null references public.schedule_uploads(id) on delete cascade,
  note_date date not null,
  body text not null check (char_length(trim(body)) between 3 and 2000),
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_date_notes_date_key unique (schedule_upload_id, note_date)
);

create index schedule_date_notes_author_idx
  on public.schedule_date_notes (author_id)
  where author_id is not null;

create trigger trg_schedule_date_notes_updated
before update on public.schedule_date_notes
for each row execute function public.set_updated_at();

alter table public.schedule_date_notes enable row level security;
revoke all on table public.schedule_date_notes from anon, authenticated;
grant select, insert, update, delete on table public.schedule_date_notes to authenticated;
grant all on table public.schedule_date_notes to service_role;

create policy "schedule_date_notes_select_authorized"
on public.schedule_date_notes
for select
to authenticated
using ((select public.can_access_schedules((select auth.uid()))));

create policy "schedule_date_notes_insert_admin"
on public.schedule_date_notes
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);

create policy "schedule_date_notes_update_admin"
on public.schedule_date_notes
for update
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check (
  author_id = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);

create policy "schedule_date_notes_delete_admin"
on public.schedule_date_notes
for delete
to authenticated
using ((select public.is_admin((select auth.uid()))));
