-- Projeto: supervisortechnet / rwstmomeldwrjmczrmnp.
-- Bases independentes; importacao em blocos, publicacao atomica e historico.
-- Os registros JSON mantem exatamente os campos utilizados pelo HTML original.
begin;

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.can_access_quality()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = (select auth.uid()) and status = 'active'
      and role in ('admin', 'supervisor'));
$$;
create or replace function private.can_manage_quality()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = (select auth.uid()) and status = 'active' and role = 'admin');
$$;
revoke all on function private.can_access_quality() from public, anon, authenticated;
revoke all on function private.can_manage_quality() from public, anon, authenticated;
grant execute on function private.can_access_quality() to authenticated;
grant execute on function private.can_manage_quality() to authenticated;

create table public.quality_imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quebra', 'certification')),
  source_file text not null check (length(source_file) between 1 and 500),
  imported_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  row_count integer not null check (row_count between 1 and 1000000),
  chunk_count integer not null check (chunk_count between 1 and 4000),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  base_import_id uuid references public.quality_imports(id),
  unique (id, kind)
);
create index quality_imports_published_idx on public.quality_imports(kind, published_at desc)
  where published_at is not null;
create index quality_imports_author_idx on public.quality_imports(imported_by);
create index quality_imports_base_idx on public.quality_imports(base_import_id) where base_import_id is not null;

create table public.quality_quebra_data (
  import_id uuid not null,
  kind text not null default 'quebra' check (kind = 'quebra'),
  chunk_index integer not null check (chunk_index >= 0),
  records jsonb not null check (jsonb_typeof(records) = 'array'
    and jsonb_array_length(records) between 1 and 500),
  primary key(import_id, chunk_index),
  foreign key(import_id, kind) references public.quality_imports(id, kind) on delete cascade
);
create table public.quality_certification_data (
  import_id uuid not null,
  kind text not null default 'certification' check (kind = 'certification'),
  chunk_index integer not null check (chunk_index >= 0),
  records jsonb not null check (jsonb_typeof(records) = 'array'
    and jsonb_array_length(records) between 1 and 500),
  primary key(import_id, chunk_index),
  foreign key(import_id, kind) references public.quality_imports(id, kind) on delete cascade
);
create table public.quality_supervisor_registry (
  singleton boolean primary key default true check (singleton),
  registry jsonb not null default '{}' check (jsonb_typeof(registry) = 'object'),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.quality_imports enable row level security;
alter table public.quality_quebra_data enable row level security;
alter table public.quality_certification_data enable row level security;
alter table public.quality_supervisor_registry enable row level security;
revoke all on public.quality_imports, public.quality_quebra_data,
  public.quality_certification_data, public.quality_supervisor_registry from public, anon, authenticated;
grant select, insert, delete on public.quality_imports to authenticated;
grant update(published_at) on public.quality_imports to authenticated;
grant select, insert on public.quality_quebra_data, public.quality_certification_data to authenticated;
grant select, insert, update on public.quality_supervisor_registry to authenticated;
grant all on public.quality_imports, public.quality_quebra_data,
  public.quality_certification_data, public.quality_supervisor_registry to service_role;

create policy quality_imports_read on public.quality_imports for select to authenticated
using ((select private.can_access_quality()) and (
  published_at is not null or imported_by = (select auth.uid())));
create policy quality_imports_create on public.quality_imports for insert to authenticated
with check ((select private.can_manage_quality()) and imported_by = (select auth.uid()) and published_at is null);
create policy quality_imports_publish on public.quality_imports for update to authenticated
using ((select private.can_manage_quality()) and imported_by = (select auth.uid()) and published_at is null)
with check ((select private.can_manage_quality()) and imported_by = (select auth.uid()));
-- Permite apenas descartar uma importacao incompleta do proprio gestor.
create policy quality_imports_discard on public.quality_imports for delete to authenticated
using ((select private.can_manage_quality()) and imported_by = (select auth.uid()) and published_at is null);

create policy quality_quebra_read on public.quality_quebra_data for select to authenticated
using ((select private.can_access_quality()) and exists (
  select 1 from public.quality_imports i where i.id = import_id
    and (i.published_at is not null or i.imported_by = (select auth.uid()))));
create policy quality_quebra_create on public.quality_quebra_data for insert to authenticated
with check ((select private.can_manage_quality()) and exists (
  select 1 from public.quality_imports i where i.id = import_id
    and i.imported_by = (select auth.uid()) and i.published_at is null and chunk_index < i.chunk_count));
create policy quality_certification_read on public.quality_certification_data for select to authenticated
using ((select private.can_access_quality()) and exists (
  select 1 from public.quality_imports i where i.id = import_id
    and (i.published_at is not null or i.imported_by = (select auth.uid()))));
create policy quality_certification_create on public.quality_certification_data for insert to authenticated
with check ((select private.can_manage_quality()) and exists (
  select 1 from public.quality_imports i where i.id = import_id
    and i.imported_by = (select auth.uid()) and i.published_at is null and chunk_index < i.chunk_count));

create policy quality_registry_read on public.quality_supervisor_registry for select to authenticated
using ((select private.can_access_quality()));
create policy quality_registry_create on public.quality_supervisor_registry for insert to authenticated
with check ((select private.can_manage_quality()) and updated_by = (select auth.uid()));
create policy quality_registry_update on public.quality_supervisor_registry for update to authenticated
using ((select private.can_manage_quality()))
with check ((select private.can_manage_quality()) and updated_by = (select auth.uid()));

-- Serializa uploads/publicacao pelo registro pai, impedindo blocos atrasados
-- de alterarem uma base ja publicada. SECURITY INVOKER preserva as RLS.
create or replace function private.lock_quality_chunk()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare publication timestamptz;
begin
  select published_at into publication from public.quality_imports
    where id = new.import_id for update;
  if not found or publication is not null then
    raise exception 'Importacao inexistente ou ja publicada.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_quality_chunk() from public, anon, authenticated;
create trigger quality_quebra_lock before insert on public.quality_quebra_data
  for each row execute function private.lock_quality_chunk();
create trigger quality_certification_lock before insert on public.quality_certification_data
  for each row execute function private.lock_quality_chunk();

create or replace function private.validate_quality_publication()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare blocks integer; rows bigint; last_index integer; latest uuid;
begin
  if old.published_at is not null or new.published_at is null then
    raise exception 'Publicacao invalida.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('quality:' || new.kind));
  select id into latest from public.quality_imports
    where kind = new.kind and published_at is not null order by published_at desc limit 1;
  if new.base_import_id is distinct from latest then
    raise exception 'Outra pessoa atualizou esta base. Clique em Atualizar e importe novamente o arquivo.' using errcode = '40001';
  end if;
  if new.kind = 'quebra' then
    select count(*), coalesce(sum(jsonb_array_length(records)),0), max(chunk_index)
      into blocks, rows, last_index from public.quality_quebra_data where import_id = new.id;
  else
    select count(*), coalesce(sum(jsonb_array_length(records)),0), max(chunk_index)
      into blocks, rows, last_index from public.quality_certification_data where import_id = new.id;
  end if;
  if blocks <> new.chunk_count or rows <> new.row_count or last_index <> blocks - 1 then
    raise exception 'Importacao incompleta: % de % blocos; % de % registros.', blocks, new.chunk_count, rows, new.row_count
      using errcode = '23514';
  end if;
  new.published_at = now();
  return new;
end;
$$;
revoke all on function private.validate_quality_publication() from public, anon, authenticated;
create trigger quality_validate_publish before update on public.quality_imports
  for each row execute function private.validate_quality_publication();

create or replace function public.publish_quality_import(p_import_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.quality_imports set published_at = now()
    where id = p_import_id and imported_by = (select auth.uid()) and published_at is null;
  if not found then
    raise exception 'Importacao nao encontrada para este gestor.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.publish_quality_import(uuid) from public, anon, authenticated;
grant execute on function public.publish_quality_import(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
