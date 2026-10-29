-- Preparação aditiva: regras configuráveis e versões de escala.
-- NÃO altera schedule_uploads: importações do Sheets continuam independentes.
create table if not exists public.schedule_generation_policies (
  id uuid primary key default gen_random_uuid(),
  city text not null check (city ~ '^[a-z0-9-]{2,50}$'),
  sector text not null check (sector ~ '^[a-z0-9-]{2,80}$'),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  version integer not null default 1 check (version >= 1),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city, sector)
);
create trigger trg_schedule_generation_policies_updated
before update on public.schedule_generation_policies
for each row execute function public.set_updated_at();

create table if not exists public.schedule_generation_drafts (
  id uuid primary key default gen_random_uuid(),
  city text not null check (city ~ '^[a-z0-9-]{2,50}$'),
  sector text not null check (sector ~ '^[a-z0-9-]{2,80}$'),
  schedule_month date not null
    check (schedule_month = date_trunc('month', schedule_month)::date),
  revision integer not null default 1 check (revision >= 1),
  source_upload_id uuid references public.schedule_uploads(id) on delete set null,
  source_month date,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'dates') = 'array'
    and jsonb_typeof(payload -> 'people') = 'array'
  ),
  policy_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(policy_snapshot) = 'object'),
  warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(warnings) = 'array'),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected')),
  created_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city, sector, schedule_month, revision)
);
create index schedule_generation_drafts_lookup_idx on
  public.schedule_generation_drafts (city, sector, schedule_month desc, revision desc);
create trigger trg_schedule_generation_drafts_updated
before update on public.schedule_generation_drafts
for each row execute function public.set_updated_at();

create table if not exists public.schedule_generation_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.schedule_generation_drafts(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in (
    'generated','edited','validated','submitted','approved','rejected'
  )),
  changes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);
create index schedule_generation_events_draft_idx on
  public.schedule_generation_events (draft_id, created_at desc);

alter table public.schedule_generation_policies enable row level security;
alter table public.schedule_generation_drafts enable row level security;
alter table public.schedule_generation_events enable row level security;

revoke all on public.schedule_generation_policies,
  public.schedule_generation_drafts,
  public.schedule_generation_events from anon, authenticated;
grant select, insert, update on public.schedule_generation_policies to authenticated;
grant select, insert, update on public.schedule_generation_drafts to authenticated;
grant select, insert on public.schedule_generation_events to authenticated;
grant all on public.schedule_generation_policies,
  public.schedule_generation_drafts,
  public.schedule_generation_events to service_role;

create policy schedule_gen_policies_read on public.schedule_generation_policies
for select to authenticated
using ((select public.can_access_schedules((select auth.uid()))));
create policy schedule_gen_policies_insert on public.schedule_generation_policies
for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);
create policy schedule_gen_policies_update on public.schedule_generation_policies
for update to authenticated
using ((select public.is_admin((select auth.uid()))))
with check (
  updated_by = (select auth.uid())
  and (select public.is_admin((select auth.uid())))
);

create policy schedule_gen_drafts_read on public.schedule_generation_drafts
for select to authenticated
using ((select public.can_access_schedules((select auth.uid()))));
create policy schedule_gen_drafts_insert on public.schedule_generation_drafts
for insert to authenticated
with check (
  created_by = (select auth.uid()) and status = 'draft'
  and (select public.can_manage_schedules((select auth.uid())))
);
create policy schedule_gen_drafts_update on public.schedule_generation_drafts
for update to authenticated
using (
  (select public.is_admin((select auth.uid())))
  or (
    status = 'draft'
    and created_by = (select auth.uid())
    and (select public.can_manage_schedules((select auth.uid())))
  )
)
with check (
  (select public.is_admin((select auth.uid())))
  or (
    status = 'draft'
    and created_by = (select auth.uid())
    and (select public.can_manage_schedules((select auth.uid())))
  )
);

create policy schedule_gen_events_read on public.schedule_generation_events
for select to authenticated
using ((select public.can_access_schedules((select auth.uid()))));
create policy schedule_gen_events_insert on public.schedule_generation_events
for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and (select public.can_manage_schedules((select auth.uid())))
  and exists (
    select 1 from public.schedule_generation_drafts d
    where d.id = draft_id
      and (d.created_by = (select auth.uid()) or (select public.is_admin((select auth.uid()))))
  )
);
